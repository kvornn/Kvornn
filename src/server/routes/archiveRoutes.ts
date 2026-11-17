import fs from 'node:fs';
import path from 'node:path';
import type { Express, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { AuthedRequest, getClientIp, requireAuth } from '../auth';
import { ServerSecrets, appendAuditLog, recordSecurityEvent } from '../db';
import {
  canPublicAccessArchive,
  canPublicAccessCategory,
  canUserAccessArchive,
  canUserAccessCategory,
  canUserDownloadFile,
  evaluatePermissionForUser,
} from '../permissionService';
import { signDownloadToken, verifyDownloadToken } from '../../shared/security';
import {
  ArchiveDTO,
  ArchiveFileDTO,
  CategoryDTO,
  FileDownloadPermission,
  PublicationStatus,
} from '../../shared/types';
import type { AuthenticatedUser } from '../auth';

function mapCategoryRow(row: any, archiveCount = 0, accessible = true): CategoryDTO {
  return {
    id: row.id,
    slug: row.slug,
    nameTr: row.name_tr,
    nameEn: row.name_en,
    descriptionTr: row.description_tr,
    descriptionEn: row.description_en,
    icon: row.icon,
    coverImageUrl: row.cover_image_url,
    accentColor: row.accent_color,
    parentId: row.parent_id,
    visibility: row.visibility,
    sortOrder: row.sort_order,
    archiveCount,
    accessible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadArchiveExtras(
  db: DatabaseSync,
  archive: any,
  user: AuthenticatedUser | null,
  catVisibility: string
) {
  const tagRows = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN archive_tags at ON at.tag_id = t.id
       WHERE at.archive_id = ?
       ORDER BY t.name ASC`
    )
    .all(archive.id) as Array<{ name: string }>;

  const fileRows = db
    .prepare(
      `SELECT id, archive_id, title, description, download_permission, original_name, mime_type, extension, size_bytes, sha256, scan_status, download_count, created_at
       FROM archive_files
       WHERE archive_id = ?
       ORDER BY created_at ASC`
    )
    .all(archive.id) as Array<any>;

  const files: ArchiveFileDTO[] = fileRows.map((f) => {
    const fileCanDownload = user
      ? canUserDownloadFile(db, user, f, archive, catVisibility).allowed
      : false;
    return {
      id: f.id,
      archiveId: f.archive_id,
      title: f.title || f.original_name,
      description: f.description || '',
      downloadPermission: (f.download_permission || 'INHERIT') as FileDownloadPermission,
      originalName: f.original_name,
      mimeType: f.mime_type,
      extension: f.extension,
      sizeBytes: f.size_bytes,
      sha256: f.sha256,
      scanStatus: f.scan_status,
      downloadCount: f.download_count,
      canDownload: fileCanDownload,
      createdAt: f.created_at,
    };
  });

  let isFavorited = false;
  if (user) {
    const fav = db
      .prepare(`SELECT 1 FROM favorites WHERE user_id = ? AND archive_id = ?`)
      .get(user.id, archive.id);
    isFavorited = Boolean(fav);
  }

  return { tags: tagRows.map((t) => t.name), files, isFavorited };
}

function mapArchiveRow(
  db: DatabaseSync,
  row: any,
  user: AuthenticatedUser | null,
  canDownload: boolean,
  catVisibility: string
): ArchiveDTO {
  const { tags, files, isFavorited } = loadArchiveExtras(db, row, user, catVisibility);
  return {
    id: row.id,
    slug: row.slug,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    titleTr: row.title_tr,
    titleEn: row.title_en,
    shortDescTr: row.short_desc_tr,
    shortDescEn: row.short_desc_en,
    longDescTr: row.long_desc_tr,
    longDescEn: row.long_desc_en,
    sourceInfo: row.source_info || '',
    coverImageUrl: row.cover_image_url,
    accessLevel: row.access_level,
    searchVisible: row.search_visible === 1,
    isFeatured: row.is_featured === 1,
    status: row.status,
    publishedAt: row.published_at,
    viewCount: row.view_count,
    tags,
    files,
    isFavorited,
    canDownload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerArchiveRoutes(
  app: Express,
  db: DatabaseSync,
  secrets: ServerSecrets,
  privateStorageDir: string
) {
  // Public non-sensitive metrics (strictly starts at 0 categories, 0 archives on first boot)
  app.get('/api/public/overview', (_req, res) => {
    const catCount = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM categories WHERE visibility = 'PUBLIC' AND parent_id IS NULL`)
        .get() as { cnt: number }
    ).cnt;
    const subcatCount = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM categories WHERE visibility = 'PUBLIC' AND parent_id IS NOT NULL`)
        .get() as { cnt: number }
    ).cnt;
    const arcCount = (
      db.prepare(`SELECT COUNT(*) as cnt FROM archives WHERE status = 'PUBLISHED'`).get() as {
        cnt: number;
      }
    ).cnt;
    const settingsRows = db.prepare(`SELECT key, value FROM system_settings`).all() as Array<{
      key: string;
      value: string;
    }>;
    const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));
    res.json({
      categoriesCount: catCount,
      subcategoriesCount: subcatCount,
      archivesCount: arcCount,
      settings,
    });
  });

  // Public homepage & directory catalog (reflects dynamic categories, featured archives, recent archives)
  app.get('/api/public/catalog', (req: AuthedRequest, res: Response) => {
    const user = req.authUser || null;
    const allCats = db
      .prepare(`SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC`)
      .all() as any[];

    const allArchives = db
      .prepare(
        `SELECT a.*, c.visibility as cat_visibility
         FROM archives a
         JOIN categories c ON c.id = a.category_id
         ORDER BY a.is_featured DESC, a.published_at DESC, a.created_at DESC`
      )
      .all() as any[];

    const catArchiveCounts = new Map<string, number>();
    const visibleArchives: ArchiveDTO[] = [];

    for (const a of allArchives) {
      const allowed = user
        ? canUserAccessArchive(db, user, a, a.cat_visibility).allowed
        : canPublicAccessArchive(db, a, a.cat_visibility);
      if (!allowed) continue;

      catArchiveCounts.set(a.category_id, (catArchiveCounts.get(a.category_id) || 0) + 1);
      if (a.subcategory_id) {
        catArchiveCounts.set(a.subcategory_id, (catArchiveCounts.get(a.subcategory_id) || 0) + 1);
      }

      const dl = user
        ? evaluatePermissionForUser(db, user, 'download_files', {
            categoryId: a.category_id,
            subcategoryId: a.subcategory_id,
            archiveId: a.id,
          }).allowed
        : false;
      visibleArchives.push(mapArchiveRow(db, a, user, dl, a.cat_visibility));
    }

    const categories: CategoryDTO[] = [];
    const subcategories: CategoryDTO[] = [];
    for (const c of allCats) {
      const allowed = user
        ? canUserAccessCategory(db, user, c).allowed
        : canPublicAccessCategory(db, c);
      if (!allowed) continue;
      const dto = mapCategoryRow(c, catArchiveCounts.get(c.id) || 0, true);
      if (c.parent_id) {
        subcategories.push(dto);
      } else {
        categories.push(dto);
      }
    }

    const featuredArchives = visibleArchives.filter((a) => a.isFeatured).slice(0, 6);
    const recentArchives = [...visibleArchives]
      .sort((a, b) => {
        const da = a.publishedAt || a.createdAt;
        const dbDate = b.publishedAt || b.createdAt;
        return dbDate.localeCompare(da);
      })
      .slice(0, 8);

    const tagSet = new Set<string>();
    for (const arc of visibleArchives) {
      for (const tg of arc.tags) tagSet.add(tg);
    }

    const filesCount = visibleArchives.reduce((sum, a) => sum + a.files.length, 0);

    res.json({
      categories,
      subcategories,
      featuredArchives,
      recentArchives,
      tags: Array.from(tagSet).sort(),
      stats: {
        categoriesCount: categories.length,
        subcategoriesCount: subcategories.length,
        archivesCount: visibleArchives.length,
        filesCount,
      },
    });
  });

  app.get('/api/categories', (req: AuthedRequest, res: Response) => {
    const user = req.authUser || null;
    const allCats = db
      .prepare(`SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC`)
      .all() as any[];

    const allArchives = db
      .prepare(
        `SELECT a.id, a.category_id, a.subcategory_id, a.status, a.access_level, c.visibility as cat_visibility
         FROM archives a
         JOIN categories c ON c.id = a.category_id`
      )
      .all() as any[];

    const counts = new Map<string, number>();
    for (const a of allArchives) {
      const allowed = user
        ? canUserAccessArchive(db, user, a, a.cat_visibility).allowed
        : canPublicAccessArchive(db, a, a.cat_visibility);
      if (!allowed) continue;
      counts.set(a.category_id, (counts.get(a.category_id) || 0) + 1);
      if (a.subcategory_id) {
        counts.set(a.subcategory_id, (counts.get(a.subcategory_id) || 0) + 1);
      }
    }

    const visible: CategoryDTO[] = [];
    for (const c of allCats) {
      const allowed = user
        ? canUserAccessCategory(db, user, c).allowed
        : canPublicAccessCategory(db, c);
      if (allowed) {
        visible.push(mapCategoryRow(c, counts.get(c.id) || 0, true));
      }
    }

    res.json({
      categories: visible.filter((c) => !c.parentId),
      subcategories: visible.filter((c) => Boolean(c.parentId)),
    });
  });

  app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const allCats = db
      .prepare(`SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC`)
      .all() as any[];

    const accessibleCategories: CategoryDTO[] = [];
    for (const c of allCats) {
      const catAccess = canUserAccessCategory(db, user, c);
      if (!catAccess.allowed) continue;

      const arcRows = db
        .prepare(`SELECT id, category_id, subcategory_id, status FROM archives WHERE category_id = ? OR subcategory_id = ?`)
        .all(c.id, c.id) as Array<{ id: string; category_id: string; subcategory_id: string | null; status: PublicationStatus }>;
      let visibleCount = 0;
      for (const a of arcRows) {
        if (canUserAccessArchive(db, user, a, c.visibility).allowed) {
          visibleCount++;
        }
      }
      accessibleCategories.push(mapCategoryRow(c, visibleCount, true));
    }

    const recentRows = db
      .prepare(
        `SELECT a.*, c.visibility as cat_visibility, rv.viewed_at
         FROM recently_viewed rv
         JOIN archives a ON a.id = rv.archive_id
         JOIN categories c ON c.id = a.category_id
         WHERE rv.user_id = ?
         ORDER BY rv.viewed_at DESC
         LIMIT 8`
      )
      .all(user.id) as any[];

    const recentArchives: ArchiveDTO[] = [];
    for (const r of recentRows) {
      if (canUserAccessArchive(db, user, r, r.cat_visibility).allowed) {
        const dl = evaluatePermissionForUser(db, user, 'download_files', {
          categoryId: r.category_id,
          subcategoryId: r.subcategory_id,
          archiveId: r.id,
        }).allowed;
        recentArchives.push(mapArchiveRow(db, r, user, dl, r.cat_visibility));
      }
    }

    const favCount = (
      db.prepare(`SELECT COUNT(*) as cnt FROM favorites WHERE user_id = ?`).get(user.id) as {
        cnt: number;
      }
    ).cnt;

    res.json({
      accessibleCategories,
      recentArchives,
      favoritesCount: favCount,
    });
  });

  // Archive Explorer & Search (accessible both to public visitors for PUBLIC/PUBLISHED archives and members via RBAC)
  app.get('/api/explorer', (req: AuthedRequest, res: Response) => {
    const user = req.authUser || null;
    const query = String(req.query.q || '').trim().toLowerCase();
    const categoryFilter = String(req.query.category || '').trim();
    const subcategoryFilter = String(req.query.subcategory || '').trim();
    const tagFilter = String(req.query.tag || '').trim().toLowerCase();
    const featuredOnly = String(req.query.featured || '') === '1';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 24)));

    if (user && query) {
      const canSearch = evaluatePermissionForUser(db, user, 'search_archives').allowed;
      if (!canSearch) {
        return res.status(403).json({
          error: 'Your current permissions do not allow searching archives',
          code: 'SEARCH_FORBIDDEN',
        });
      }
    }

    const allCats = db
      .prepare(`SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC`)
      .all() as any[];

    const visibleCategories: CategoryDTO[] = [];
    for (const c of allCats) {
      const allowed = user
        ? canUserAccessCategory(db, user, c).allowed
        : canPublicAccessCategory(db, c);
      if (allowed) {
        visibleCategories.push(mapCategoryRow(c, 0, true));
      }
    }

    const allArchives = db
      .prepare(
        `SELECT a.*, c.visibility as cat_visibility
         FROM archives a
         JOIN categories c ON c.id = a.category_id
         ORDER BY a.is_featured DESC, a.published_at DESC, a.created_at DESC`
      )
      .all() as any[];

    const catArchiveCounts = new Map<string, number>();
    const matchingArchives: ArchiveDTO[] = [];

    for (const a of allArchives) {
      const allowed = user
        ? canUserAccessArchive(db, user, a, a.cat_visibility).allowed
        : canPublicAccessArchive(db, a, a.cat_visibility);
      if (!allowed) continue;

      catArchiveCounts.set(a.category_id, (catArchiveCounts.get(a.category_id) || 0) + 1);
      if (a.subcategory_id) {
        catArchiveCounts.set(a.subcategory_id, (catArchiveCounts.get(a.subcategory_id) || 0) + 1);
      }

      if (categoryFilter && a.category_id !== categoryFilter && a.subcategory_id !== categoryFilter) {
        continue;
      }

      if (subcategoryFilter && a.subcategory_id !== subcategoryFilter) {
        continue;
      }

      if (featuredOnly && a.is_featured !== 1) {
        continue;
      }

      if (query && a.search_visible !== 1 && user?.rank !== 'ADMIN') {
        continue;
      }

      const dl = user
        ? evaluatePermissionForUser(db, user, 'download_files', {
            categoryId: a.category_id,
            subcategoryId: a.subcategory_id,
            archiveId: a.id,
          }).allowed
        : false;
      const dto = mapArchiveRow(db, a, user, dl, a.cat_visibility);

      if (tagFilter && !dto.tags.some((t) => t.toLowerCase() === tagFilter)) {
        continue;
      }

      if (query) {
        const haystack = [
          dto.titleTr,
          dto.titleEn,
          dto.shortDescTr,
          dto.shortDescEn,
          dto.sourceInfo,
          ...dto.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) continue;
      }

      matchingArchives.push(dto);
    }

    for (const vc of visibleCategories) {
      vc.archiveCount = catArchiveCounts.get(vc.id) || 0;
    }

    const total = matchingArchives.length;
    const offset = (page - 1) * limit;
    const paginated = matchingArchives.slice(offset, offset + limit);

    res.json({
      categories: visibleCategories,
      archives: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  });

  app.get('/api/categories/:slugOrId', (req: AuthedRequest, res: Response) => {
    const user = req.authUser || null;
    const key = String(req.params.slugOrId);
    const cat = db
      .prepare(`SELECT * FROM categories WHERE id = ? OR slug = ?`)
      .get(key, key) as any;

    if (!cat) {
      return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
    }

    if (user) {
      const access = canUserAccessCategory(db, user, cat);
      if (!access.allowed) {
        return res.status(403).json({
          error: 'Access denied to this category',
          code: 'ACCESS_DENIED',
          resolution: access,
        });
      }
    } else if (!canPublicAccessCategory(db, cat)) {
      return res.status(403).json({
        error: 'Authentication required or restricted category',
        code: 'ACCESS_DENIED',
      });
    }

    const subcategories = (
      db
        .prepare(`SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order ASC`)
        .all(cat.id) as any[]
    )
      .filter((sc) =>
        user ? canUserAccessCategory(db, user, sc).allowed : canPublicAccessCategory(db, sc)
      )
      .map((sc) => mapCategoryRow(sc, 0, true));

    const archiveRows = db
      .prepare(
        `SELECT a.*, c.visibility as cat_visibility
         FROM archives a
         JOIN categories c ON c.id = a.category_id
         WHERE a.category_id = ? OR a.subcategory_id = ?
         ORDER BY a.is_featured DESC, a.published_at DESC, a.created_at DESC`
      )
      .all(cat.id, cat.id) as any[];

    const archives: ArchiveDTO[] = [];
    for (const a of archiveRows) {
      const allowed = user
        ? canUserAccessArchive(db, user, a, a.cat_visibility).allowed
        : canPublicAccessArchive(db, a, a.cat_visibility);
      if (allowed) {
        const dl = user
          ? evaluatePermissionForUser(db, user, 'download_files', {
              categoryId: a.category_id,
              subcategoryId: a.subcategory_id,
              archiveId: a.id,
            }).allowed
          : false;
        archives.push(mapArchiveRow(db, a, user, dl, a.cat_visibility));
      }
    }

    res.json({
      category: mapCategoryRow(cat, archives.length, true),
      subcategories,
      archives,
    });
  });

  app.get('/api/archives/:slugOrId', (req: AuthedRequest, res: Response) => {
    const user = req.authUser || null;
    const key = String(req.params.slugOrId);
    const archive = db
      .prepare(
        `SELECT a.*, c.visibility as cat_visibility, c.slug as cat_slug, c.name_tr as cat_name_tr, c.name_en as cat_name_en,
                sc.slug as sub_slug, sc.name_tr as sub_name_tr, sc.name_en as sub_name_en
         FROM archives a
         JOIN categories c ON c.id = a.category_id
         LEFT JOIN categories sc ON sc.id = a.subcategory_id
         WHERE a.id = ? OR a.slug = ?`
      )
      .get(key, key) as any;

    if (!archive) {
      return res.status(404).json({ error: 'Archive not found', code: 'NOT_FOUND' });
    }

    if (user) {
      const access = canUserAccessArchive(db, user, archive, archive.cat_visibility);
      if (!access.allowed) {
        recordSecurityEvent(db, {
          eventType: 'UNAUTHORIZED_ARCHIVE_ACCESS',
          severity: 'WARN',
          userId: user.id,
          ipAddress: getClientIp(req),
          details: `Denied access to archive ${archive.id} (${access.decidedBy})`,
        });
        return res.status(403).json({
          error: 'Access denied to this archive',
          code: 'ACCESS_DENIED',
          resolution: access,
        });
      }
    } else if (!canPublicAccessArchive(db, archive, archive.cat_visibility)) {
      return res.status(403).json({
        error: 'Access denied or sign-in required for this archive',
        code: 'ACCESS_DENIED',
      });
    }

    db.prepare(`UPDATE archives SET view_count = view_count + 1 WHERE id = ?`).run(archive.id);
    if (user) {
      db.prepare(
        `INSERT INTO recently_viewed (user_id, archive_id, viewed_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, archive_id) DO UPDATE SET viewed_at = excluded.viewed_at`
      ).run(user.id, archive.id, new Date().toISOString());
    }

    const canDownload = user
      ? evaluatePermissionForUser(db, user, 'download_files', {
          categoryId: archive.category_id,
          subcategoryId: archive.subcategory_id,
          archiveId: archive.id,
        }).allowed
      : false;

    const dto = mapArchiveRow(
      db,
      { ...archive, view_count: archive.view_count + 1 },
      user,
      canDownload,
      archive.cat_visibility
    );

    res.json({
      archive: dto,
      category: {
        id: archive.category_id,
        slug: archive.cat_slug,
        nameTr: archive.cat_name_tr,
        nameEn: archive.cat_name_en,
      },
      subcategory: archive.subcategory_id
        ? {
            id: archive.subcategory_id,
            slug: archive.sub_slug,
            nameTr: archive.sub_name_tr,
            nameEn: archive.sub_name_en,
          }
        : null,
    });
  });

  // Favorites
  app.get('/api/favorites', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const rows = db
      .prepare(
        `SELECT a.*, c.visibility as cat_visibility
         FROM favorites f
         JOIN archives a ON a.id = f.archive_id
         JOIN categories c ON c.id = a.category_id
         WHERE f.user_id = ?
         ORDER BY f.created_at DESC`
      )
      .all(user.id) as any[];

    const items: ArchiveDTO[] = [];
    for (const r of rows) {
      if (canUserAccessArchive(db, user, r, r.cat_visibility).allowed) {
        const dl = evaluatePermissionForUser(db, user, 'download_files', {
          categoryId: r.category_id,
          subcategoryId: r.subcategory_id,
          archiveId: r.id,
        }).allowed;
        items.push(mapArchiveRow(db, r, user, dl, r.cat_visibility));
      }
    }
    res.json({ favorites: items });
  });

  app.post('/api/favorites/:archiveId', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const archiveId = String(req.params.archiveId);
    const archive = db
      .prepare(
        `SELECT a.*, c.visibility as cat_visibility FROM archives a JOIN categories c ON c.id = a.category_id WHERE a.id = ?`
      )
      .get(archiveId) as any;
    if (!archive || !canUserAccessArchive(db, user, archive, archive.cat_visibility).allowed) {
      return res.status(403).json({ error: 'Archive not accessible', code: 'ACCESS_DENIED' });
    }
    const perm = evaluatePermissionForUser(db, user, 'add_favorites', {
      categoryId: archive.category_id,
      subcategoryId: archive.subcategory_id,
      archiveId,
    });
    if (!perm.allowed) {
      return res.status(403).json({ error: 'Favorites permission denied', code: 'ACCESS_DENIED' });
    }
    db.prepare(
      `INSERT OR IGNORE INTO favorites (user_id, archive_id, created_at) VALUES (?, ?, ?)`
    ).run(user.id, archiveId, new Date().toISOString());
    res.json({ isFavorited: true });
  });

  app.delete('/api/favorites/:archiveId', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    db.prepare(`DELETE FROM favorites WHERE user_id = ? AND archive_id = ?`).run(
      user.id,
      String(req.params.archiveId)
    );
    res.json({ isFavorited: false });
  });

  // Issue time-limited HMAC signed download URL (enforces archive access + per-file download_permission + RBAC)
  app.post('/api/files/:fileId/sign-url', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const fileId = String(req.params.fileId);

    const file = db
      .prepare(
        `SELECT f.*, a.id as arc_id, a.category_id, a.subcategory_id, a.status, c.visibility as cat_visibility
         FROM archive_files f
         JOIN archives a ON a.id = f.archive_id
         JOIN categories c ON c.id = a.category_id
         WHERE f.id = ?`
      )
      .get(fileId) as any;

    if (!file) {
      return res.status(404).json({ error: 'File not found', code: 'NOT_FOUND' });
    }

    const dlCheck = canUserDownloadFile(
      db,
      user,
      file,
      {
        id: file.arc_id,
        category_id: file.category_id,
        subcategory_id: file.subcategory_id,
        status: file.status,
      },
      file.cat_visibility
    );

    if (!dlCheck.allowed) {
      recordSecurityEvent(db, {
        eventType: 'UNAUTHORIZED_DOWNLOAD_ATTEMPT',
        severity: 'WARN',
        userId: user.id,
        ipAddress: getClientIp(req),
        details: `Blocked download link generation for file ${fileId}: ${dlCheck.reason}`,
      });
      return res.status(403).json({
        error: dlCheck.reason || 'File download permission denied',
        code: 'DOWNLOAD_DENIED',
      });
    }

    const ttlRow = db
      .prepare(`SELECT value FROM system_settings WHERE key = 'signed_url_ttl_seconds'`)
      .get() as { value: string } | undefined;
    const ttlSeconds = Math.max(30, Math.min(600, Number(ttlRow?.value || 120)));
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    const sig = signDownloadToken(fileId, user.id, expiresAtMs, secrets.sessionSecret);

    res.json({
      downloadUrl: `/api/files/download/${encodeURIComponent(fileId)}?exp=${expiresAtMs}&sig=${sig}`,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  });

  // Stream protected file only after verifying auth + HMAC signature + expiry + live per-file/RBAC permissions
  app.get('/api/files/download/:fileId', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const fileId = String(req.params.fileId);
    const exp = Number(req.query.exp || 0);
    const sig = String(req.query.sig || '');

    if (!verifyDownloadToken(fileId, user.id, exp, sig, secrets.sessionSecret)) {
      recordSecurityEvent(db, {
        eventType: 'INVALID_SIGNED_URL',
        severity: 'HIGH',
        userId: user.id,
        ipAddress: getClientIp(req),
        details: `Invalid or expired signed URL for file ${fileId}`,
      });
      return res.status(403).json({ error: 'Invalid or expired download link', code: 'INVALID_SIGNED_URL' });
    }

    const file = db
      .prepare(
        `SELECT f.*, a.id as arc_id, a.category_id, a.subcategory_id, a.status, c.visibility as cat_visibility
         FROM archive_files f
         JOIN archives a ON a.id = f.archive_id
         JOIN categories c ON c.id = a.category_id
         WHERE f.id = ?`
      )
      .get(fileId) as any;

    if (!file) {
      return res.status(404).json({ error: 'File not found', code: 'NOT_FOUND' });
    }

    const dlCheck = canUserDownloadFile(
      db,
      user,
      file,
      {
        id: file.arc_id,
        category_id: file.category_id,
        subcategory_id: file.subcategory_id,
        status: file.status,
      },
      file.cat_visibility
    );
    if (!dlCheck.allowed) {
      return res.status(403).json({ error: 'Download permission denied', code: 'ACCESS_DENIED' });
    }

    const diskPath = path.resolve(privateStorageDir, path.basename(file.stored_name));
    if (!diskPath.startsWith(path.resolve(privateStorageDir)) || !fs.existsSync(diskPath)) {
      return res.status(404).json({ error: 'Stored file missing', code: 'STORAGE_MISSING' });
    }

    db.prepare(`UPDATE archive_files SET download_count = download_count + 1 WHERE id = ?`).run(fileId);
    appendAuditLog(db, {
      actorId: user.id,
      actorUsername: user.username,
      action: 'FILE_DOWNLOAD',
      targetType: 'archive_file',
      targetId: fileId,
      summary: `${user.username} downloaded ${file.original_name}`,
    });

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.original_name.replace(/["\r\n]/g, '_')}"`
    );

    const stream = fs.createReadStream(diskPath);
    stream.pipe(res);
  });
}
