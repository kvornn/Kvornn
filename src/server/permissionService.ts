import type { DatabaseSync } from 'node:sqlite';
import {
  FileDownloadPermission,
  PermissionKey,
  PermissionResolutionResult,
  PublicationStatus,
  RuleEffect,
  UserRank,
} from '../shared/types';
import { combineRoleRules, resolvePermission } from '../shared/permissions';
import type { AuthenticatedUser } from './auth';

export function getRolePermissionMap(
  db: DatabaseSync,
  roleId: string
): Partial<Record<PermissionKey, boolean>> {
  const rows = db
    .prepare(`SELECT permission_key, allowed FROM role_permissions WHERE role_id = ?`)
    .all(roleId) as Array<{ permission_key: PermissionKey; allowed: number }>;

  const map: Partial<Record<PermissionKey, boolean>> = {};
  for (const r of rows) {
    map[r.permission_key] = r.allowed === 1;
  }
  return map;
}

export function getEffectiveRolePermissionMap(
  db: DatabaseSync,
  rank: UserRank,
  customRoleIds: string[]
): Partial<Record<PermissionKey, boolean>> {
  const subjectIds = [rank, ...customRoleIds];
  const placeholders = subjectIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT permission_key, MAX(allowed) as allowed
       FROM role_permissions
       WHERE role_id IN (${placeholders})
       GROUP BY permission_key`
    )
    .all(...subjectIds) as Array<{ permission_key: PermissionKey; allowed: number }>;

  const map: Partial<Record<PermissionKey, boolean>> = {};
  for (const r of rows) {
    map[r.permission_key] = r.allowed === 1;
  }
  return map;
}

export function evaluatePermissionForUser(
  db: DatabaseSync,
  user: AuthenticatedUser | null,
  permission: PermissionKey,
  context?: { categoryId?: string | null; subcategoryId?: string | null; archiveId?: string | null }
): PermissionResolutionResult {
  if (!user) {
    return {
      allowed: false,
      decidedBy: 'ACCOUNT_STATUS',
      reason: 'Unauthenticated visitor',
      trace: [{ tier: 'ACCOUNT_STATUS', effect: 'DENY' }],
    };
  }

  const customRoleIds = (user.customRoles || []).map((r) => r.id);
  const subjectRoleIds = [user.rank, ...customRoleIds];
  const placeholders = subjectRoleIds.map(() => '?').join(', ');

  const rolePermissions = getEffectiveRolePermissionMap(db, user.rank, customRoleIds);
  const categoryId = context?.categoryId ?? null;
  const subcategoryId = context?.subcategoryId ?? null;
  const archiveId = context?.archiveId ?? null;

  let categoryRules: RuleEffect[] = [];
  if (categoryId) {
    const catRows = db
      .prepare(
        `SELECT effect FROM category_permissions WHERE category_id = ? AND role_id IN (${placeholders})`
      )
      .all(categoryId, ...subjectRoleIds) as Array<{ effect: RuleEffect }>;
    categoryRules = catRows.map((r) => r.effect);
  }

  let subcategoryRules: RuleEffect[] = [];
  if (subcategoryId && subcategoryId !== categoryId) {
    const subRows = db
      .prepare(
        `SELECT effect FROM category_permissions WHERE category_id = ? AND role_id IN (${placeholders})`
      )
      .all(subcategoryId, ...subjectRoleIds) as Array<{ effect: RuleEffect }>;
    subcategoryRules = subRows.map((r) => r.effect);
  }

  let archiveRules: RuleEffect[] = [];
  if (archiveId) {
    const arcRows = db
      .prepare(
        `SELECT effect FROM archive_permissions WHERE archive_id = ? AND role_id IN (${placeholders})`
      )
      .all(archiveId, ...subjectRoleIds) as Array<{ effect: RuleEffect }>;
    archiveRules = arcRows.map((r) => r.effect);
  }

  const globalOverrideRow = db
    .prepare(
      `SELECT effect FROM user_permission_overrides
       WHERE user_id = ? AND scope = 'GLOBAL' AND (permission_key = ? OR permission_key IS NULL)
       ORDER BY CASE WHEN permission_key IS NOT NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 1`
    )
    .get(user.id, permission) as { effect: RuleEffect } | undefined;

  let userCategoryOverride: RuleEffect | null = null;
  if (categoryId) {
    const row = db
      .prepare(
        `SELECT effect FROM user_permission_overrides
         WHERE user_id = ? AND scope = 'CATEGORY' AND (target_id = ? OR target_id = ?)
           AND (permission_key = ? OR permission_key IS NULL)
         ORDER BY CASE WHEN effect = 'DENY' THEN 0 ELSE 1 END,
                  CASE WHEN permission_key IS NOT NULL THEN 0 ELSE 1 END,
                  created_at DESC LIMIT 1`
      )
      .get(user.id, categoryId, subcategoryId || categoryId, permission) as
      | { effect: RuleEffect }
      | undefined;
    userCategoryOverride = row?.effect ?? null;
  }

  let userArchiveOverride: RuleEffect | null = null;
  if (archiveId) {
    const row = db
      .prepare(
        `SELECT effect FROM user_permission_overrides
         WHERE user_id = ? AND scope = 'ARCHIVE' AND target_id = ?
           AND (permission_key = ? OR permission_key IS NULL)
         ORDER BY CASE WHEN permission_key IS NOT NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 1`
      )
      .get(user.id, archiveId, permission) as { effect: RuleEffect } | undefined;
    userArchiveOverride = row?.effect ?? null;
  }

  return resolvePermission({
    rank: user.rank,
    adminProfile: user.adminProfile,
    keyType: user.keyType,
    accountStatus: user.status,
    permission,
    categoryId,
    subcategoryId,
    archiveId,
    rolePermissions,
    categoryRules,
    subcategoryRules,
    archiveRules,
    userGlobalOverride: globalOverrideRow?.effect ?? null,
    userCategoryOverride,
    userArchiveOverride,
  });
}

export function canUserAccessCategory(
  db: DatabaseSync,
  user: AuthenticatedUser | null,
  category: { id: string; visibility: string; parent_id?: string | null }
): PermissionResolutionResult {
  if (!user) {
    return {
      allowed: false,
      decidedBy: 'ACCOUNT_STATUS',
      reason: 'Authentication required',
      trace: [{ tier: 'ACCOUNT_STATUS', effect: 'DENY' }],
    };
  }

  if (category.visibility !== 'PUBLIC' && user.rank !== 'ADMIN') {
    const hiddenCheck = evaluatePermissionForUser(db, user, 'view_hidden_content');
    if (!hiddenCheck.allowed) return hiddenCheck;
  }

  return evaluatePermissionForUser(db, user, 'view_categories', {
    categoryId: category.parent_id || category.id,
    subcategoryId: category.parent_id ? category.id : null,
  });
}

export function canUserAccessArchive(
  db: DatabaseSync,
  user: AuthenticatedUser | null,
  archive: {
    id: string;
    category_id: string;
    subcategory_id?: string | null;
    status: PublicationStatus;
    search_visible?: number;
  },
  categoryVisibility: string
): PermissionResolutionResult {
  if (!user) {
    return {
      allowed: false,
      decidedBy: 'ACCOUNT_STATUS',
      reason: 'Authentication required',
      trace: [{ tier: 'ACCOUNT_STATUS', effect: 'DENY' }],
    };
  }

  if (archive.status !== 'PUBLISHED' && user.rank !== 'ADMIN') {
    if (archive.status === 'HIDDEN') {
      const hiddenRes = evaluatePermissionForUser(db, user, 'view_hidden_content');
      if (!hiddenRes.allowed) return hiddenRes;
    } else {
      return {
        allowed: false,
        decidedBy: 'DEFAULT_DENY',
        reason: `Archive status is ${archive.status}`,
        trace: [{ tier: 'DEFAULT_DENY', effect: 'DENY' }],
      };
    }
  }

  if (categoryVisibility !== 'PUBLIC' && user.rank !== 'ADMIN') {
    const hiddenCat = evaluatePermissionForUser(db, user, 'view_hidden_content');
    if (!hiddenCat.allowed) return hiddenCat;
  }

  return evaluatePermissionForUser(db, user, 'view_archives', {
    categoryId: archive.category_id,
    subcategoryId: archive.subcategory_id ?? null,
    archiveId: archive.id,
  });
}

/**
 * Unauthenticated public catalog access check:
 * Only strictly PUBLIC categories without an explicit UYE DENY rule are exposed publicly.
 */
export function canPublicAccessCategory(
  db: DatabaseSync,
  category: { id: string; visibility: string; parent_id?: string | null }
): boolean {
  if (category.visibility !== 'PUBLIC') return false;

  const uyeRolePerms = getRolePermissionMap(db, 'UYE');
  const catRuleRow = db
    .prepare(`SELECT effect FROM category_permissions WHERE category_id = ? AND role_id = 'UYE'`)
    .get(category.id) as { effect: RuleEffect } | undefined;

  let parentRule: RuleEffect = 'INHERIT';
  if (category.parent_id) {
    const parent = db
      .prepare(`SELECT visibility FROM categories WHERE id = ?`)
      .get(category.parent_id) as { visibility: string } | undefined;
    if (!parent || parent.visibility !== 'PUBLIC') return false;

    const parentRuleRow = db
      .prepare(`SELECT effect FROM category_permissions WHERE category_id = ? AND role_id = 'UYE'`)
      .get(category.parent_id) as { effect: RuleEffect } | undefined;
    parentRule = parentRuleRow?.effect ?? 'INHERIT';
  }

  const effective = catRuleRow?.effect && catRuleRow.effect !== 'INHERIT' ? catRuleRow.effect : parentRule;
  if (effective === 'DENY') return false;
  if (effective === 'ALLOW') return true;
  return Boolean(uyeRolePerms.view_categories);
}

/**
 * Unauthenticated public archive access check:
 * Strictly LIMITED to PUBLISHED archives in PUBLIC categories with non-restricted access_level
 * and no DENY rules on UYE across archive/subcategory/category.
 */
export function canPublicAccessArchive(
  db: DatabaseSync,
  archive: {
    id: string;
    category_id: string;
    subcategory_id?: string | null;
    status: PublicationStatus;
    access_level?: string;
    search_visible?: number;
  },
  categoryVisibility: string
): boolean {
  if (archive.status !== 'PUBLISHED') return false;
  if (categoryVisibility !== 'PUBLIC') return false;

  const accessLevel = String(archive.access_level || 'STANDARD').toUpperCase();
  if (['RESTRICTED', 'CLASSIFIED', 'PRIVATE', 'SPECIAL'].includes(accessLevel)) {
    return false;
  }

  const uyePerms = getRolePermissionMap(db, 'UYE');
  const arcRule = db
    .prepare(`SELECT effect FROM archive_permissions WHERE archive_id = ? AND role_id = 'UYE'`)
    .get(archive.id) as { effect: RuleEffect } | undefined;
  const subRule = archive.subcategory_id
    ? (db
        .prepare(`SELECT effect FROM category_permissions WHERE category_id = ? AND role_id = 'UYE'`)
        .get(archive.subcategory_id) as { effect: RuleEffect } | undefined)
    : undefined;
  const catRule = db
    .prepare(`SELECT effect FROM category_permissions WHERE category_id = ? AND role_id = 'UYE'`)
    .get(archive.category_id) as { effect: RuleEffect } | undefined;

  const res = resolvePermission({
    rank: 'UYE',
    adminProfile: null,
    keyType: 'MEMBER',
    accountStatus: 'ACTIVE',
    permission: 'view_archives',
    categoryId: archive.category_id,
    subcategoryId: archive.subcategory_id ?? null,
    archiveId: archive.id,
    rolePermissions: uyePerms,
    archiveRules: arcRule ? [arcRule.effect] : [],
    subcategoryRules: subRule ? [subRule.effect] : [],
    categoryRules: catRule ? [catRule.effect] : [],
  });
  return res.allowed;
}

/**
 * Enforces both archive access, per-file downloadPermission ('INHERIT' | 'ALLOW' | 'DENY'),
 * malware scan status, and role/override download_files permission.
 */
export function canUserDownloadFile(
  db: DatabaseSync,
  user: AuthenticatedUser | null,
  file: {
    download_permission?: FileDownloadPermission | string | null;
    scan_status?: string | null;
  },
  archive: {
    id: string;
    category_id: string;
    subcategory_id?: string | null;
    status: PublicationStatus;
  },
  categoryVisibility: string
): { allowed: boolean; reason: string } {
  if (!user) {
    return { allowed: false, reason: 'Authentication required' };
  }
  if (file.scan_status === 'QUARANTINED') {
    return { allowed: false, reason: 'File is quarantined' };
  }

  const arcAccess = canUserAccessArchive(db, user, archive, categoryVisibility);
  if (!arcAccess.allowed) {
    return { allowed: false, reason: arcAccess.reason };
  }

  if (user.rank === 'ADMIN' && user.adminProfile === 'ADMIN' && user.keyType === 'ADMIN') {
    return { allowed: true, reason: 'Granted via unified ADMIN privilege' };
  }

  const policy = String(file.download_permission || 'INHERIT').toUpperCase() as FileDownloadPermission;
  if (policy === 'DENY') {
    return { allowed: false, reason: 'Download disabled by per-file policy' };
  }

  const dlRes = evaluatePermissionForUser(db, user, 'download_files', {
    categoryId: archive.category_id,
    subcategoryId: archive.subcategory_id ?? null,
    archiveId: archive.id,
  });

  if (policy === 'ALLOW') {
    // Allow unless an explicit user DENY override or explicit DENY rule blocked download_files
    if (!dlRes.allowed && dlRes.decidedBy !== 'ROLE_PERMISSION' && dlRes.decidedBy !== 'DEFAULT_DENY') {
      return { allowed: false, reason: dlRes.reason };
    }
    return { allowed: true, reason: 'Permitted by per-file ALLOW policy' };
  }

  return { allowed: dlRes.allowed, reason: dlRes.reason };
}

export function combineEffects(effects: Array<RuleEffect | null | undefined>): RuleEffect {
  return combineRoleRules(effects);
}
