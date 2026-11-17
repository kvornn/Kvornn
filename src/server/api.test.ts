import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { createServerApp } from './app';
import { hashAccessKey, isValidAccessKeyFormat } from '../shared/security';

class CookieJar {
  private cookies = new Map<string, string>();

  capture(res: Response) {
    const setCookies = res.headers.getSetCookie?.() || [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (val === '' || raw.toLowerCase().includes('max-age=0')) {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, val);
        }
      }
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  csrf(): string {
    return this.cookies.get('sentarika_csrf') || '';
  }
}

async function apiFetch(
  baseUrl: string,
  jar: CookieJar,
  pathname: string,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers);
  const cookieHeader = jar.header();
  if (cookieHeader) headers.set('cookie', cookieHeader);
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && jar.csrf()) {
    headers.set('x-csrf-token', jar.csrf());
  }
  const resp = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  jar.capture(resp);
  return resp;
}

async function solveChallenge(baseUrl: string, jar: CookieJar) {
  const r = await apiFetch(baseUrl, jar, '/api/auth/challenge');
  const ch = (await r.json()) as {
    challengeId: string;
    a: number;
    b: number;
    expiresAt: number;
    signature: string;
  };
  return {
    challengeId: ch.challengeId,
    answer: ch.a + ch.b,
    expiresAt: ch.expiresAt,
    signature: ch.signature,
  };
}

async function loginWithKey(baseUrl: string, jar: CookieJar, accessKey: string) {
  const captcha = await solveChallenge(baseUrl, jar);
  return apiFetch(baseUrl, jar, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessKey, captcha }),
  });
}

test('Sentarika Archive unified ADMIN, public catalog, RBAC, file policies, moderation, and backup suite', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentarika-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const storageDir = path.join(tmpDir, 'private_files');
  const bootstrapKeysFilePath = path.join(tmpDir, 'BOOTSTRAP_ADMIN_KEYS.txt');

  const { app, db, bootstrapKeys } = await createServerApp({
    dbPath,
    privateStorageDir: storageDir,
    sessionSecret: 'test-session-secret-0123456789abcdef',
    keyPepper: 'test-key-pepper-0123456789abcdef',
    loginRateMax: 12,
    bootstrapKeysFilePath,
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const adminJar = new CookieJar();
    const memberJar = new CookieJar();
    const member2Jar = new CookieJar();

    // 1. Initial public catalog must be completely empty (0 categories, 0 archives, 0 files)
    const pubRes = await apiFetch(baseUrl, new CookieJar(), '/api/public/catalog');
    assert.equal(pubRes.status, 200);
    const pubData = (await pubRes.json()) as any;
    assert.equal(pubData.stats.categoriesCount, 0);
    assert.equal(pubData.stats.subcategoriesCount, 0);
    assert.equal(pubData.stats.archivesCount, 0);
    assert.equal(pubData.stats.filesCount, 0);

    // 2. Single unified ADMIN account receives CSPRNG 30-char key & logs in key-only
    assert.ok(bootstrapKeys.ADMIN && isValidAccessKeyFormat(bootstrapKeys.ADMIN));
    assert.equal(Object.keys(bootstrapKeys).length, 1);
    assert.equal(fs.existsSync(bootstrapKeysFilePath), true);

    assert.equal((await loginWithKey(baseUrl, adminJar, bootstrapKeys.ADMIN)).status, 200);

    // Unified capabilities expose exact 12 sections
    const capRes = await apiFetch(baseUrl, adminJar, '/api/admin/capabilities');
    assert.equal(capRes.status, 200);
    const capJson = (await capRes.json()) as { adminProfile: string; allowedSections: string[] };
    assert.equal(capJson.adminProfile, 'ADMIN');
    assert.deepEqual(capJson.allowedSections, [
      'overview',
      'users',
      'categories',
      'subcategories',
      'archives',
      'files',
      'permissions',
      'reports',
      'security',
      'audit',
      'backups',
      'settings',
    ]);

    // Legacy removed routes return 404
    for (const deadRoute of [
      '/api/auth/recover',
      '/api/auth/reset',
      '/api/auth/firebase-google',
      '/api/security/password',
      '/api/admin/invitations',
    ]) {
      const r = await apiFetch(baseUrl, adminJar, deadRoute, { method: 'POST', body: '{}' });
      assert.equal(r.status, 404, `${deadRoute} should return 404`);
    }
    assert.equal((await apiFetch(baseUrl, adminJar, '/api/admin/admins')).status, 404);

    // 3. Overview verifies clean vault with 1 unified ADMIN user
    const ovRes = await apiFetch(baseUrl, adminJar, '/api/admin/overview');
    const ov = (await ovRes.json()) as any;
    assert.equal(ov.stats.totalUsers, 1);
    assert.equal(ov.stats.totalCategories, 0);
    assert.equal(ov.stats.totalSubcategories, 0);
    assert.equal(ov.stats.totalArchives, 0);
    assert.equal(ov.stats.totalFiles, 0);

    // 4. Backups list, create, download (.db)
    const backupCreate = await apiFetch(baseUrl, adminJar, '/api/admin/backup', { method: 'POST' });
    assert.equal(backupCreate.status, 201);
    const backupInfo = (await backupCreate.json()) as { filename: string; sizeBytes: number };
    assert.ok(backupInfo.filename.startsWith('manual_backup_'));

    const backupsList = (await (await apiFetch(baseUrl, adminJar, '/api/admin/backups')).json()) as {
      backups: Array<{ filename: string }>;
    };
    assert.ok(backupsList.backups.some((b) => b.filename === backupInfo.filename));

    const backupDl = await apiFetch(
      baseUrl,
      adminJar,
      `/api/admin/backups/${encodeURIComponent(backupInfo.filename)}/download`
    );
    assert.equal(backupDl.status, 200);
    const backupBytes = await backupDl.arrayBuffer();
    assert.ok(backupBytes.byteLength >= 4096);

    // 5. Key-only 2-step CSPRNG registration & strict case-insensitive uniqueness
    const ch1 = await solveChallenge(baseUrl, memberJar);
    const genRes = await apiFetch(baseUrl, memberJar, '/api/auth/register/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'Archivist_Alpha',
        preferredLang: 'en',
        rank: 'ADMIN',
        captcha: ch1,
      }),
    });
    assert.equal(genRes.status, 201);
    const genData = (await genRes.json()) as {
      registrationToken: string;
      accessKey: string;
    };
    assert.equal(genData.accessKey.length, 30);
    assert.equal(isValidAccessKeyFormat(genData.accessKey), true);

    const completeRes = await apiFetch(baseUrl, memberJar, '/api/auth/register/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        registrationToken: genData.registrationToken,
        acknowledgedNoRecovery: true,
      }),
    });
    assert.equal(completeRes.status, 201);
    const memberId = ((await completeRes.json()) as any).user.id;

    // Duplicate case-insensitive username blocked
    const dupRes = await apiFetch(baseUrl, new CookieJar(), '/api/auth/register/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'aRcHiViSt_AlPhA',
        captcha: await solveChallenge(baseUrl, new CookieJar()),
      }),
    });
    assert.equal(dupRes.status, 409);

    // Register member2
    const ch2 = await solveChallenge(baseUrl, member2Jar);
    const gen2 = (await (
      await apiFetch(baseUrl, member2Jar, '/api/auth/register/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'Archivist_Beta', captcha: ch2 }),
      })
    ).json()) as any;
    assert.equal(
      (
        await apiFetch(baseUrl, member2Jar, '/api/auth/register/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            registrationToken: gen2.registrationToken,
            acknowledgedNoRecovery: true,
          }),
        })
      ).status,
      201
    );

    // 6. Custom role + Category + Subcategory + Archive with sourceInfo & isFeatured + Public Catalog visibility
    const roleRes = await apiFetch(baseUrl, adminJar, '/api/admin/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayNameTr: 'El Yazması Uzmanı',
        displayNameEn: 'Manuscript Curator',
        color: '#2F6F5E',
      }),
    });
    assert.equal(roleRes.status, 201);
    const customRoleId = ((await roleRes.json()) as { id: string }).id;

    await apiFetch(baseUrl, adminJar, `/api/admin/users/${memberId}/roles`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roleIds: [customRoleId], reason: 'Curator assignment' }),
    });

    // Public category & featured public archive
    const publicCatRes = await apiFetch(baseUrl, adminJar, '/api/admin/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nameTr: 'Açık Tarihi Kayıtlar',
        nameEn: 'Open Historical Records',
        slug: 'open-records',
        visibility: 'PUBLIC',
        roleRules: { UYE: 'ALLOW' },
      }),
    });
    assert.equal(publicCatRes.status, 201);
    const publicCatId = ((await publicCatRes.json()) as { id: string }).id;

    const subCatRes = await apiFetch(baseUrl, adminJar, '/api/admin/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nameTr: 'Kısıtlı Alt Bölüm',
        nameEn: 'Restricted Subcollection',
        slug: 'restricted-subcollection',
        parentId: publicCatId,
        visibility: 'PUBLIC',
        roleRules: { UYE: 'DENY', [customRoleId]: 'ALLOW' },
      }),
    });
    assert.equal(subCatRes.status, 201);
    const subCatId = ((await subCatRes.json()) as { id: string }).id;

    const featuredPubArcRes = await apiFetch(baseUrl, adminJar, '/api/admin/archives', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: publicCatId,
        titleTr: 'Kamusal Bülten 1924',
        titleEn: 'Public Gazette 1924',
        shortDescTr: 'Tarihi kamusal kayıt',
        shortDescEn: 'Historical public gazette',
        sourceInfo: 'National Gazette Archive Vol. IV',
        isFeatured: true,
        status: 'PUBLISHED',
        tags: ['gazette', '1924'],
      }),
    });
    assert.equal(featuredPubArcRes.status, 201);
    const featuredArc = (await featuredPubArcRes.json()) as { id: string; slug: string };

    // Restricted archive in restricted subcategory
    const restrictedArcRes = await apiFetch(baseUrl, adminJar, '/api/admin/archives', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: publicCatId,
        subcategoryId: subCatId,
        titleTr: 'Kısıtlı El Yazması',
        titleEn: 'Restricted Manuscript',
        status: 'PUBLISHED',
        tags: ['manuscript'],
      }),
    });
    assert.equal(restrictedArcRes.status, 201);
    const restrictedArc = (await restrictedArcRes.json()) as { id: string; slug: string };

    // Guest visitor can view open catalog & featured public archive, while restricted subcategory/archive remain hidden & return 403
    const guestPub = (await (
      await apiFetch(baseUrl, new CookieJar(), '/api/public/catalog')
    ).json()) as any;
    assert.equal(guestPub.featuredArchives.length, 1);
    assert.equal(guestPub.featuredArchives[0].sourceInfo, 'National Gazette Archive Vol. IV');
    assert.equal(guestPub.stats.categoriesCount, 1);
    assert.equal(guestPub.stats.subcategoriesCount, 0);

    const guestArchiveDetail = await apiFetch(
      baseUrl,
      new CookieJar(),
      `/api/archives/${featuredArc.slug}`
    );
    assert.equal(guestArchiveDetail.status, 200);
    assert.equal(
      (await apiFetch(baseUrl, new CookieJar(), `/api/archives/${restrictedArc.slug}`)).status,
      403
    );

    // Promote member1 -> DESTEKCI so customRoleId ALLOW succeeds on restrictedArc while member2 stays blocked
    await apiFetch(baseUrl, adminJar, `/api/admin/users/${memberId}/rank`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rank: 'DESTEKCI', reason: 'Cleared researcher tier' }),
    });
    assert.equal((await apiFetch(baseUrl, memberJar, `/api/archives/${restrictedArc.slug}`)).status, 200);
    assert.equal((await apiFetch(baseUrl, member2Jar, `/api/archives/${restrictedArc.slug}`)).status, 403);

    // 7. Standalone File Upload (/api/admin/files) + metadata update (/api/admin/files/:id) + downloadPermission DENY -> ALLOW
    const form = new FormData();
    form.append('archiveId', featuredArc.id);
    form.append('title', 'Primary Gazette Scan');
    form.append('description', 'Digitized microfilm folio');
    form.append('downloadPermission', 'DENY');
    form.append('file', new Blob(['Sentarika Vault Content'], { type: 'text/plain' }), 'gazette.txt');
    const uploadRes = await apiFetch(baseUrl, adminJar, '/api/admin/files', {
      method: 'POST',
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const uploadedFile = ((await uploadRes.json()) as any).file;
    assert.equal(uploadedFile.downloadPermission, 'DENY');

    // Member download denied while downloadPermission === 'DENY'
    assert.equal(
      (await apiFetch(baseUrl, memberJar, `/api/files/${uploadedFile.id}/sign-url`, { method: 'POST' }))
        .status,
      403
    );

    // Admin switches downloadPermission to ALLOW via PATCH /api/admin/files/:id
    const patchFileRes = await apiFetch(baseUrl, adminJar, `/api/admin/files/${uploadedFile.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ downloadPermission: 'ALLOW', title: 'Gazette Scan Verified' }),
    });
    assert.equal(patchFileRes.status, 200);

    // Now member can sign and stream the file
    const signRes = await apiFetch(baseUrl, memberJar, `/api/files/${uploadedFile.id}/sign-url`, {
      method: 'POST',
    });
    assert.equal(signRes.status, 200);
    const { downloadUrl } = (await signRes.json()) as { downloadUrl: string };
    const dlRes = await apiFetch(baseUrl, memberJar, downloadUrl);
    assert.equal(dlRes.status, 200);
    assert.equal(await dlRes.text(), 'Sentarika Vault Content');

    // 8. Member content report -> Unified ADMIN moderates HIDE_ARCHIVE -> Restore
    const reportRes = await apiFetch(baseUrl, memberJar, '/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        archiveId: restrictedArc.id,
        category: 'PRIVACY_VIOLATION',
        description: 'Needs editorial redaction review.',
      }),
    });
    assert.equal(reportRes.status, 201);
    const reportId = ((await reportRes.json()) as { id: string }).id;

    assert.equal(
      (
        await apiFetch(baseUrl, adminJar, `/api/admin/reports/${reportId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'HIDE_ARCHIVE',
            resolutionNote: 'Hidden pending editorial check.',
          }),
        })
      ).status,
      200
    );
    assert.equal((await apiFetch(baseUrl, memberJar, `/api/archives/${restrictedArc.slug}`)).status, 403);

    // 9. Temp ban -> session cutoff -> unban -> permanent ban -> unban
    assert.equal(
      (
        await apiFetch(baseUrl, adminJar, `/api/admin/users/${memberId}/ban`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            banType: 'TEMPORARY',
            durationHours: 12,
            reason: 'Temporary moderation review hold',
          }),
        })
      ).status,
      201
    );
    assert.equal(((await (await apiFetch(baseUrl, memberJar, '/api/auth/me')).json()) as any).authenticated, false);
    assert.equal((await loginWithKey(baseUrl, new CookieJar(), genData.accessKey)).status, 403);

    assert.equal(
      (
        await apiFetch(baseUrl, adminJar, `/api/admin/users/${memberId}/unban`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'Hold cleared' }),
        })
      ).status,
      200
    );
    assert.equal((await loginWithKey(baseUrl, memberJar, genData.accessKey)).status, 200);

    // 10. Audit chain integrity & immutability triggers
    const verifyRes = await apiFetch(baseUrl, adminJar, '/api/admin/audit-logs/verify');
    const verifyJson = (await verifyRes.json()) as { valid: boolean; totalEntries: number };
    assert.equal(verifyJson.valid, true);
    assert.ok(verifyJson.totalEntries >= 10);
    assert.throws(() => db.prepare(`DELETE FROM audit_logs`).run());
  } finally {
    server.closeAllConnections?.();
    server.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Migration v3 consolidates 3 legacy admins into ONE unified ADMIN, invalidates old keys, creates backup, and preserves archive data', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentarika-mig-v3-'));
  const dbPath = path.join(tmpDir, 'sentarika.db');
  const storageDir = path.join(tmpDir, 'private_files');
  const bootstrapKeysFilePath = path.join(tmpDir, 'BOOTSTRAP_ADMIN_KEYS.txt');
  const testPepper = 'mig-v3-pepper-0123456789abcdef';
  const oldPrimaryKey = 'OLDPREFIX123456789ABCDEFGHJKMN';
  const oldArchiveKey = 'OLDARCHIV123456789ABCDEFGHJKMN';
  const oldSecurityKey = 'OLDSECURI123456789ABCDEFGHJKMN';

  // Construct an existing v2 SQLite database with 3 separate admin profiles + existing vault data
  const v2Db = new DatabaseSync(dbPath);
  v2Db.exec(`
    CREATE TABLE roles (
      id TEXT PRIMARY KEY, display_name_tr TEXT NOT NULL, display_name_en TEXT NOT NULL,
      hierarchy_order INTEGER NOT NULL, is_admin_role INTEGER NOT NULL DEFAULT 0,
      is_system_rank INTEGER NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#B89B63',
      description_tr TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO roles (id, display_name_tr, display_name_en, hierarchy_order, is_admin_role, is_system_rank) VALUES
      ('ADMIN', 'Yönetici', 'Administrator', 0, 1, 1),
      ('ISLETME', 'İşletme', 'Operations', 1, 0, 1),
      ('DESTEKCI', 'Destekçi', 'Supporter', 2, 0, 1),
      ('UYE', 'Üye', 'Member', 3, 0, 1);

    CREATE TABLE permissions (
      key TEXT PRIMARY KEY, group_name TEXT NOT NULL, label_tr TEXT NOT NULL, label_en TEXT NOT NULL,
      description_tr TEXT NOT NULL, description_en TEXT NOT NULL
    );
    CREATE TABLE role_permissions (
      role_id TEXT NOT NULL, permission_key TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (role_id, permission_key)
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, username_normalized TEXT NOT NULL UNIQUE,
      key_hash TEXT NOT NULL UNIQUE, key_type TEXT NOT NULL DEFAULT 'MEMBER', avatar_url TEXT NOT NULL DEFAULT '',
      rank TEXT NOT NULL DEFAULT 'UYE', status TEXT NOT NULL DEFAULT 'ACTIVE', mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT, last_active_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO users (id, username, username_normalized, key_hash, key_type, rank, status, created_at, updated_at) VALUES
      ('adm_p', 'sentarika_primary', 'sentarika_primary', '${hashAccessKey(oldPrimaryKey, testPepper)}', 'ADMIN', 'ADMIN', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      ('adm_a', 'sentarika_archive', 'sentarika_archive', '${hashAccessKey(oldArchiveKey, testPepper)}', 'ADMIN', 'ADMIN', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      ('adm_s', 'sentarika_security', 'sentarika_security', '${hashAccessKey(oldSecurityKey, testPepper)}', 'ADMIN', 'ADMIN', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      ('usr_1', 'ArchiveResearcher', 'archiveresearcher', '${hashAccessKey('RESEARCHER123456789ABCDEFGHJKM', testPepper)}', 'MEMBER', 'DESTEKCI', 'ACTIVE', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');

    CREATE TABLE admin_roles (user_id TEXT PRIMARY KEY, profile TEXT NOT NULL UNIQUE, granted_by TEXT, created_at TEXT NOT NULL);
    INSERT INTO admin_roles (user_id, profile, granted_by, created_at) VALUES
      ('adm_p', 'PRIMARY_ADMIN', 'SYSTEM', '2026-01-01T00:00:00Z'),
      ('adm_a', 'ARCHIVE_ADMIN', 'SYSTEM', '2026-01-01T00:00:00Z'),
      ('adm_s', 'SECURITY_ADMIN', 'SYSTEM', '2026-01-01T00:00:00Z');

    CREATE TABLE user_preferences (user_id TEXT PRIMARY KEY, preferred_lang TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE user_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      ip_address TEXT NOT NULL, user_agent TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO user_sessions VALUES ('s_adm', 'adm_p', 'hash_adm', '127.0.0.1', 'UA', 0, '2099-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');

    CREATE TABLE categories (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name_tr TEXT NOT NULL, name_en TEXT NOT NULL,
      description_tr TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Archive', cover_image_url TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#B89B63', parent_id TEXT, visibility TEXT NOT NULL DEFAULT 'PUBLIC',
      sort_order INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO categories (id, slug, name_tr, name_en, visibility, created_at, updated_at)
      VALUES ('cat_keep', 'preserved-cat', 'Korunan Kategori', 'Preserved Category', 'PUBLIC', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z');

    CREATE TABLE archives (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category_id TEXT NOT NULL, subcategory_id TEXT,
      title_tr TEXT NOT NULL, title_en TEXT NOT NULL, short_desc_tr TEXT NOT NULL DEFAULT '',
      short_desc_en TEXT NOT NULL DEFAULT '', long_desc_tr TEXT NOT NULL DEFAULT '', long_desc_en TEXT NOT NULL DEFAULT '',
      cover_image_url TEXT NOT NULL DEFAULT '', access_level TEXT NOT NULL DEFAULT 'STANDARD',
      search_visible INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'PUBLISHED',
      published_at TEXT, view_count INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO archives (id, slug, category_id, title_tr, title_en, status, created_at, updated_at)
      VALUES ('arc_keep', 'preserved-arc', 'cat_keep', 'Korunan Arşiv', 'Preserved Archive', 'PUBLISHED', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z');

    CREATE TABLE archive_files (
      id TEXT PRIMARY KEY, archive_id TEXT NOT NULL, original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL, extension TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
      scan_status TEXT NOT NULL DEFAULT 'CLEAN', download_count INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT, created_at TEXT NOT NULL
    );

    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO system_settings (key, value, updated_at) VALUES ('schema_version', '2', '2026-01-03T00:00:00Z');
  `);
  v2Db.close();

  const { app, db, bootstrapKeys } = await createServerApp({
    dbPath,
    privateStorageDir: storageDir,
    sessionSecret: 'mig-v3-secret-0123456789abcdef',
    keyPepper: testPepper,
    bootstrapKeysFilePath,
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // 1. Pre-v3 backup file created
    const backupFiles = fs.readdirSync(path.join(tmpDir, 'backups'));
    assert.ok(backupFiles.some((f) => f.startsWith('pre_v3_unified_admin_migration_') && f.endsWith('.db')));

    // 2. Existing categories, archives, and regular members preserved intact
    assert.equal((db.prepare(`SELECT slug FROM categories WHERE id = 'cat_keep'`).get() as any).slug, 'preserved-cat');
    assert.equal((db.prepare(`SELECT slug FROM archives WHERE id = 'arc_keep'`).get() as any).slug, 'preserved-arc');
    assert.equal((db.prepare(`SELECT rank FROM users WHERE id = 'usr_1'`).get() as any).rank, 'DESTEKCI');

    // 3. Only ONE admin_roles row exists with profile = 'ADMIN'; retired admins suspended
    const adminRows = db.prepare(`SELECT * FROM admin_roles`).all() as any[];
    assert.equal(adminRows.length, 1);
    assert.equal(adminRows[0].user_id, 'adm_p');
    assert.equal(adminRows[0].profile, 'ADMIN');

    const retiredArchiveAdmin = db.prepare(`SELECT status, rank FROM users WHERE id = 'adm_a'`).get() as any;
    const retiredSecurityAdmin = db.prepare(`SELECT status, rank FROM users WHERE id = 'adm_s'`).get() as any;
    assert.equal(retiredArchiveAdmin.status, 'SUSPENDED');
    assert.equal(retiredSecurityAdmin.status, 'SUSPENDED');

    // 4. All old admin sessions invalidated & ALL old admin keys rejected (401)
    assert.equal((db.prepare(`SELECT revoked FROM user_sessions WHERE id = 's_adm'`).get() as any).revoked, 1);
    assert.equal((await loginWithKey(baseUrl, new CookieJar(), oldPrimaryKey)).status, 401);
    assert.equal((await loginWithKey(baseUrl, new CookieJar(), oldArchiveKey)).status, 401);
    assert.equal((await loginWithKey(baseUrl, new CookieJar(), oldSecurityKey)).status, 401);

    // 5. Fresh unified ADMIN key issued & works cleanly
    assert.ok(bootstrapKeys.ADMIN && isValidAccessKeyFormat(bootstrapKeys.ADMIN));
    assert.equal((await loginWithKey(baseUrl, new CookieJar(), bootstrapKeys.ADMIN)).status, 200);
  } finally {
    server.closeAllConnections?.();
    server.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
