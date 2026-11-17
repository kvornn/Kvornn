import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import multer from 'multer';
import {
  AuthedRequest,
  getUserCustomRoles,
  requireAdminCapability,
  requireAuth,
} from '../auth';
import { ServerSecrets, appendAuditLog, createDatabaseBackup } from '../db';
import { runMalwareScanHook } from '../securityHooks';
import {
  canManageTargetUser,
  hasAdminCapability,
} from '../../shared/permissions';
import { evaluatePermissionForUser, getRolePermissionMap } from '../permissionService';
import {
  validateUploadFile,
  verifyAuditChain,
} from '../../shared/security';
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_MEMBER_RANKS,
  AccountStatus,
  FileDownloadPermission,
  PermissionKey,
  PublicationStatus,
  RuleEffect,
  UserRank,
} from '../../shared/types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function getAllConfigurableRoleIds(db: DatabaseSync): string[] {
  const customRows = db
    .prepare(`SELECT id FROM roles WHERE is_system_rank = 0 AND is_admin_role = 0 ORDER BY hierarchy_order ASC`)
    .all() as Array<{ id: string }>;
  return [...ASSIGNABLE_MEMBER_RANKS, ...customRows.map((r) => r.id)];
}

export function registerAdminRoutes(
  app: Express,
  db: DatabaseSync,
  _secrets: ServerSecrets,
  privateStorageDir: string
) {
  const tmpUploadDir = path.join(path.dirname(privateStorageDir), 'tmp_uploads');
  const backupDir = path.join(path.dirname(privateStorageDir), 'backups');
  fs.mkdirSync(privateStorageDir, { recursive: true });
  fs.mkdirSync(tmpUploadDir, { recursive: true });

  const upload = multer({
    dest: tmpUploadDir,
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  // Unified Admin Overview
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireAdminCapability('admin.overview'),
    (_req: AuthedRequest, res: Response) => {
      const totalUsers = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;
      const activeUsers = (
        db.prepare(`SELECT COUNT(*) as c FROM users WHERE status = 'ACTIVE'`).get() as { c: number }
      ).c;
      const uyeCount = (
        db.prepare(`SELECT COUNT(*) as c FROM users WHERE rank = 'UYE'`).get() as { c: number }
      ).c;
      const destekciCount = (
        db.prepare(`SELECT COUNT(*) as c FROM users WHERE rank = 'DESTEKCI'`).get() as { c: number }
      ).c;
      const isletmeCount = (
        db.prepare(`SELECT COUNT(*) as c FROM users WHERE rank = 'ISLETME'`).get() as { c: number }
      ).c;
      const totalCategories = (
        db.prepare(`SELECT COUNT(*) as c FROM categories WHERE parent_id IS NULL`).get() as { c: number }
      ).c;
      const totalSubcategories = (
        db.prepare(`SELECT COUNT(*) as c FROM categories WHERE parent_id IS NOT NULL`).get() as { c: number }
      ).c;
      const totalArchives = (
        db.prepare(`SELECT COUNT(*) as c FROM archives`).get() as { c: number }
      ).c;
      const totalFiles = (
        db.prepare(`SELECT COUNT(*) as c FROM archive_files`).get() as { c: number }
      ).c;
      const draftArchives = (
        db.prepare(`SELECT COUNT(*) as c FROM archives WHERE status = 'DRAFT'`).get() as { c: number }
      ).c;
      const activeBans = (
        db.prepare(`SELECT COUNT(*) as c FROM bans WHERE active = 1`).get() as { c: number }
      ).c;
      const openReports = (
        db.prepare(`SELECT COUNT(*) as c FROM content_reports WHERE status = 'OPEN'`).get() as {
          c: number;
        }
      ).c;

      const recentSecurityEvents = db
        .prepare(`SELECT * FROM security_events ORDER BY created_at DESC LIMIT 8`)
        .all();
      const recentAuditLogs = db
        .prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 10`)
        .all();

      res.json({
        stats: {
          totalUsers,
          activeUsers,
          uyeCount,
          destekciCount,
          isletmeCount,
          totalCategories,
          totalSubcategories,
          totalArchives,
          totalFiles,
          openReports,
          pendingActions: draftArchives + activeBans + openReports,
        },
        recentSecurityEvents,
        recentAuditLogs,
      });
    }
  );

  // User Management
  app.get(
    '/api/admin/users',
    requireAuth,
    requireAdminCapability('admin.users'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT u.id, u.username, u.key_type, u.avatar_url, u.rank, u.status, u.mfa_enabled,
                  u.last_active_at, u.created_at,
                  ar.profile as admin_profile,
                  COALESCE(up.preferred_lang, 'tr') as preferred_lang,
                  (SELECT COUNT(*) FROM user_sessions s WHERE s.user_id = u.id AND s.revoked = 0) as active_sessions,
                  (SELECT b.reason FROM bans b WHERE b.user_id = u.id AND b.active = 1 ORDER BY b.created_at DESC LIMIT 1) as ban_reason,
                  (SELECT b.expires_at FROM bans b WHERE b.user_id = u.id AND b.active = 1 ORDER BY b.created_at DESC LIMIT 1) as ban_expires_at
           FROM users u
           LEFT JOIN admin_roles ar ON ar.user_id = u.id
           LEFT JOIN user_preferences up ON up.user_id = u.id
           ORDER BY CASE u.rank WHEN 'ADMIN' THEN 0 WHEN 'ISLETME' THEN 1 WHEN 'DESTEKCI' THEN 2 ELSE 3 END, u.created_at DESC`
        )
        .all() as any[];

      res.json({
        users: rows.map((r) => ({
          id: r.id,
          username: r.username,
          avatarUrl: r.avatar_url,
          rank: r.rank,
          adminProfile: r.admin_profile,
          keyType: r.key_type || 'MEMBER',
          customRoles: getUserCustomRoles(db, r.id),
          status: r.status,
          preferredLang: r.preferred_lang,
          mfaEnabled: r.mfa_enabled === 1,
          activeSessions: r.active_sessions,
          lastActiveAt: r.last_active_at,
          createdAt: r.created_at,
          banReason: r.ban_reason,
          banExpiresAt: r.ban_expires_at,
        })),
      });
    }
  );

  app.post(
    '/api/admin/users/:id/rank',
    requireAuth,
    requireAdminCapability('admin.users'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const targetId = String(req.params.id);
      const nextRank = String(req.body?.rank || '') as UserRank;
      const reason = String(req.body?.reason || '').trim();

      if (!ASSIGNABLE_MEMBER_RANKS.includes(nextRank as any)) {
        return res.status(400).json({
          error: 'Target rank must be UYE, DESTEKCI, or ISLETME',
          code: 'INVALID_RANK',
        });
      }
      if (reason.length < 3) {
        return res.status(400).json({ error: 'Reason is required (min 3 chars)', code: 'REASON_REQUIRED' });
      }

      const target = db
        .prepare(
          `SELECT u.id, u.username, u.rank, ar.profile as admin_profile
           FROM users u LEFT JOIN admin_roles ar ON ar.user_id = u.id WHERE u.id = ?`
        )
        .get(targetId) as { id: string; username: string; rank: UserRank; admin_profile: any } | undefined;

      if (!target) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

      if (!canManageTargetUser(actor.rank, actor.adminProfile, actor.id, target.rank, target.admin_profile, target.id)) {
        return res.status(403).json({
          error: 'Cannot change rank for self or administrator account',
          code: 'HIERARCHY_FORBIDDEN',
        });
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE users SET rank = ?, updated_at = ? WHERE id = ?`).run(nextRank, now, targetId);

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'USER_RANK_CHANGED',
        targetType: 'user',
        targetId,
        summary: `${actor.username} changed rank of ${target.username} from ${target.rank} to ${nextRank}: ${reason}`,
        beforeObj: { rank: target.rank },
        afterObj: { rank: nextRank, reason },
      });

      res.json({ ok: true, rank: nextRank });
    }
  );

  app.put(
    '/api/admin/users/:id/roles',
    requireAuth,
    requireAdminCapability('admin.users'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const targetId = String(req.params.id);
      const incomingRoleIds = Array.isArray(req.body?.roleIds)
        ? (req.body.roleIds as string[]).map((x) => String(x).trim()).filter(Boolean)
        : [];
      const reason = String(req.body?.reason || '').trim();

      if (reason.length < 3) {
        return res.status(400).json({ error: 'Reason is required (min 3 chars)', code: 'REASON_REQUIRED' });
      }

      const target = db
        .prepare(
          `SELECT u.id, u.username, u.rank, ar.profile as admin_profile
           FROM users u LEFT JOIN admin_roles ar ON ar.user_id = u.id WHERE u.id = ?`
        )
        .get(targetId) as any;
      if (!target) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

      if (!canManageTargetUser(actor.rank, actor.adminProfile, actor.id, target.rank, target.admin_profile, target.id)) {
        return res.status(403).json({ error: 'Cannot alter roles for self or administrator account', code: 'HIERARCHY_FORBIDDEN' });
      }

      const validCustomIds = new Set(
        (
          db.prepare(`SELECT id FROM roles WHERE is_system_rank = 0 AND is_admin_role = 0`).all() as Array<{
            id: string;
          }>
        ).map((r) => r.id)
      );

      for (const rid of incomingRoleIds) {
        if (!validCustomIds.has(rid)) {
          return res.status(400).json({ error: `Invalid custom role: ${rid}`, code: 'INVALID_ROLE' });
        }
      }

      const uniqueIds = Array.from(new Set(incomingRoleIds));
      const beforeRoles = getUserCustomRoles(db, targetId).map((r) => r.id);
      const now = new Date().toISOString();

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`DELETE FROM user_custom_roles WHERE user_id = ?`).run(targetId);
        const ins = db.prepare(
          `INSERT INTO user_custom_roles (user_id, role_id, assigned_by, created_at) VALUES (?, ?, ?, ?)`
        );
        for (const rid of uniqueIds) {
          ins.run(targetId, rid, actor.id, now);
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'USER_CUSTOM_ROLES_UPDATED',
          targetType: 'user',
          targetId,
          summary: `${actor.username} updated custom roles for ${target.username}: ${reason}`,
          beforeObj: { roleIds: beforeRoles },
          afterObj: { roleIds: uniqueIds, reason },
        });
        db.exec('COMMIT');
        res.json({ customRoles: getUserCustomRoles(db, targetId) });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.post(
    '/api/admin/users/:id/revoke-sessions',
    requireAuth,
    requireAdminCapability('admin.users'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const targetId = String(req.params.id);
      const target = db
        .prepare(`SELECT u.id, u.username, u.rank FROM users u WHERE u.id = ?`)
        .get(targetId) as any;

      if (!target) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
      if (target.rank === 'ADMIN' && target.id !== actor.id) {
        return res.status(403).json({ error: 'Cannot terminate another administrator session', code: 'FORBIDDEN' });
      }

      const result = db.prepare(`UPDATE user_sessions SET revoked = 1 WHERE user_id = ?`).run(targetId);
      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'ADMIN_REVOKE_USER_SESSIONS',
        targetType: 'user',
        targetId,
        summary: `${actor.username} terminated ${result.changes} sessions for ${target.username}`,
      });
      res.json({ revokedCount: result.changes });
    }
  );

  // Bans & Suspensions (unified ADMIN authority)
  app.get(
    '/api/admin/bans',
    requireAuth,
    requireAdminCapability('admin.users'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT b.*, u.username, u.rank, u.status as current_user_status,
                  ib.username as issued_by_name, lb.username as lifted_by_name
           FROM bans b
           JOIN users u ON u.id = b.user_id
           LEFT JOIN users ib ON ib.id = b.issued_by
           LEFT JOIN users lb ON lb.id = b.lifted_by
           ORDER BY b.created_at DESC`
        )
        .all();
      res.json({ bans: rows });
    }
  );

  app.post(
    '/api/admin/users/:id/ban',
    requireAuth,
    requireAdminCapability('admin.users'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const targetId = String(req.params.id);
      const banType = String(req.body?.banType || 'TEMPORARY').toUpperCase();
      const reason = String(req.body?.reason || '').trim();
      const durationHours = Number(req.body?.durationHours || 24);

      if (!['TEMPORARY', 'PERMANENT', 'SUSPENSION'].includes(banType)) {
        return res.status(400).json({ error: 'Invalid ban type', code: 'INVALID_BAN_TYPE' });
      }
      if (reason.length < 5) {
        return res.status(400).json({ error: 'Ban reason is mandatory (min 5 chars)', code: 'REASON_REQUIRED' });
      }

      const target = db
        .prepare(`SELECT u.id, u.username, u.rank, u.status, ar.profile as admin_profile FROM users u LEFT JOIN admin_roles ar ON ar.user_id = u.id WHERE u.id = ?`)
        .get(targetId) as any;
      if (!target) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

      if (!canManageTargetUser(actor.rank, actor.adminProfile, actor.id, target.rank, target.admin_profile, target.id)) {
        return res.status(403).json({ error: 'Cannot ban self or administrator account', code: 'HIERARCHY_FORBIDDEN' });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const nextStatus: AccountStatus =
        banType === 'PERMANENT' ? 'BANNED_PERM' : banType === 'SUSPENSION' ? 'SUSPENDED' : 'BANNED_TEMP';
      const expiresAt =
        banType === 'TEMPORARY'
          ? new Date(now.getTime() + Math.max(1, durationHours) * 3600_000).toISOString()
          : null;

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`UPDATE bans SET active = 0 WHERE user_id = ? AND active = 1`).run(targetId);
        const banId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO bans (id, user_id, ban_type, reason, issued_by, expires_at, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
        ).run(banId, targetId, banType, reason, actor.id, expiresAt, nowIso);

        db.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(nextStatus, nowIso, targetId);
        db.prepare(`UPDATE user_sessions SET revoked = 1 WHERE user_id = ?`).run(targetId);

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'USER_BANNED',
          targetType: 'user',
          targetId,
          summary: `${actor.username} applied ${banType} (${nextStatus}) to ${target.username}: ${reason}`,
          beforeObj: { status: target.status },
          afterObj: { status: nextStatus, banType, reason, expiresAt },
        });
        db.exec('COMMIT');
        res.status(201).json({ ok: true, banId, status: nextStatus, expiresAt });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.post(
    '/api/admin/users/:id/unban',
    requireAuth,
    requireAdminCapability('admin.users'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const targetId = String(req.params.id);
      const reason = String(req.body?.reason || 'Sanction lifted by administration').trim();
      const target = db.prepare(`SELECT id, username, status FROM users WHERE id = ?`).get(targetId) as any;
      if (!target) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

      const now = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `UPDATE bans SET active = 0, lifted_by = ?, lifted_reason = ?, lifted_at = ? WHERE user_id = ? AND active = 1`
        ).run(actor.id, reason, now, targetId);
        db.prepare(`UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?`).run(now, targetId);

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'USER_UNBANNED',
          targetType: 'user',
          targetId,
          summary: `${actor.username} restored account ${target.username}: ${reason}`,
          beforeObj: { status: target.status },
          afterObj: { status: 'ACTIVE', reason },
        });
        db.exec('COMMIT');
        res.json({ ok: true, status: 'ACTIVE' });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  // Custom Roles & Permission Matrix Manager
  app.get(
    '/api/admin/roles',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT r.*,
                  (SELECT COUNT(*) FROM user_custom_roles ucr WHERE ucr.role_id = r.id) as custom_member_count,
                  (SELECT COUNT(*) FROM users u WHERE u.rank = r.id) as rank_member_count
           FROM roles r
           ORDER BY r.hierarchy_order ASC, r.created_at ASC`
        )
        .all() as any[];

      res.json({
        roles: rows.map((r) => ({
          id: r.id,
          displayNameTr: r.display_name_tr,
          displayNameEn: r.display_name_en,
          hierarchyOrder: r.hierarchy_order,
          isAdminRole: r.is_admin_role === 1,
          isSystemRank: r.is_system_rank === 1,
          color: r.color || '#B89B63',
          descriptionTr: r.description_tr || '',
          descriptionEn: r.description_en || '',
          memberCount: r.is_system_rank === 1 ? r.rank_member_count : r.custom_member_count,
          createdAt: r.created_at || '',
        })),
      });
    }
  );

  app.post(
    '/api/admin/roles',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const body = req.body || {};
      const displayNameTr = String(body.displayNameTr || body.name || '').trim();
      const displayNameEn = String(body.displayNameEn || body.name || '').trim();
      if (!displayNameTr && !displayNameEn) {
        return res.status(400).json({ error: 'Role name is required', code: 'NAME_REQUIRED' });
      }

      const color = /^#[0-9a-fA-F]{6}$/.test(String(body.color || ''))
        ? String(body.color)
        : '#B89B63';
      const id = `role_${slugify(displayNameEn || displayNameTr).slice(0, 20) || 'custom'}_${crypto.randomBytes(2).toString('hex')}`;
      const maxOrder = (
        db.prepare(`SELECT COALESCE(MAX(hierarchy_order), 10) as m FROM roles WHERE is_admin_role = 0`).get() as {
          m: number;
        }
      ).m;
      const now = new Date().toISOString();

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `INSERT INTO roles (id, display_name_tr, display_name_en, hierarchy_order, is_admin_role, is_system_rank, color, description_tr, description_en, created_at)
           VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
        ).run(
          id,
          displayNameTr || displayNameEn,
          displayNameEn || displayNameTr,
          Number.isFinite(Number(body.hierarchyOrder)) ? Number(body.hierarchyOrder) : maxOrder + 1,
          color,
          String(body.descriptionTr || '').trim().slice(0, 300),
          String(body.descriptionEn || '').trim().slice(0, 300),
          now
        );

        const initialPerms = body.permissions || {};
        const permStmt = db.prepare(
          `INSERT INTO role_permissions (role_id, permission_key, allowed) VALUES (?, ?, ?)`
        );
        for (const perm of ALL_PERMISSIONS) {
          permStmt.run(id, perm, initialPerms[perm] ? 1 : 0);
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'CUSTOM_ROLE_CREATED',
          targetType: 'role',
          targetId: id,
          summary: `${actor.username} created custom role "${displayNameEn || displayNameTr}"`,
          afterObj: { id, displayNameTr, displayNameEn, color },
        });
        db.exec('COMMIT');
        res.status(201).json({ id });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.patch(
    '/api/admin/roles/:id',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const id = String(req.params.id);
      const existing = db.prepare(`SELECT * FROM roles WHERE id = ?`).get(id) as any;
      if (!existing) return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
      if (existing.is_admin_role === 1) {
        return res.status(403).json({ error: 'Admin system role cannot be modified here', code: 'FORBIDDEN' });
      }

      const body = req.body || {};
      const color = /^#[0-9a-fA-F]{6}$/.test(String(body.color || ''))
        ? String(body.color)
        : existing.color;

      db.prepare(
        `UPDATE roles
         SET display_name_tr = ?, display_name_en = ?, color = ?, description_tr = ?, description_en = ?, hierarchy_order = ?
         WHERE id = ?`
      ).run(
        body.displayNameTr ?? existing.display_name_tr,
        body.displayNameEn ?? existing.display_name_en,
        color,
        body.descriptionTr ?? existing.description_tr,
        body.descriptionEn ?? existing.description_en,
        body.hierarchyOrder !== undefined ? Number(body.hierarchyOrder) : existing.hierarchy_order,
        id
      );

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'ROLE_UPDATED',
        targetType: 'role',
        targetId: id,
        summary: `${actor.username} updated role ${id}`,
        beforeObj: existing,
        afterObj: body,
      });

      res.json({ ok: true });
    }
  );

  app.delete(
    '/api/admin/roles/:id',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const id = String(req.params.id);
      const existing = db.prepare(`SELECT * FROM roles WHERE id = ?`).get(id) as any;
      if (!existing) return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
      if (existing.is_system_rank === 1 || existing.is_admin_role === 1) {
        return res.status(403).json({
          error: 'Fundamental system ranks cannot be deleted',
          code: 'SYSTEM_RANK_PROTECTED',
        });
      }

      db.prepare(`DELETE FROM roles WHERE id = ?`).run(id);
      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'CUSTOM_ROLE_DELETED',
        targetType: 'role',
        targetId: id,
        summary: `${actor.username} deleted custom role ${existing.display_name_en}`,
        beforeObj: existing,
      });
      res.json({ ok: true });
    }
  );

  app.get(
    '/api/admin/permissions',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (_req: AuthedRequest, res: Response) => {
      const roles = db.prepare(`SELECT * FROM roles ORDER BY hierarchy_order ASC`).all();
      const permissions = db.prepare(`SELECT * FROM permissions ORDER BY group_name ASC, key ASC`).all();
      const matrixRows = db.prepare(`SELECT role_id, permission_key, allowed FROM role_permissions`).all() as Array<{
        role_id: string;
        permission_key: PermissionKey;
        allowed: number;
      }>;

      const matrix: Record<string, Record<string, boolean>> = {};
      for (const r of matrixRows) {
        if (!matrix[r.role_id]) matrix[r.role_id] = {};
        matrix[r.role_id][r.permission_key] = r.allowed === 1;
      }

      const overrides = db
        .prepare(
          `SELECT o.*, u.username, u.rank
           FROM user_permission_overrides o
           JOIN users u ON u.id = o.user_id
           ORDER BY o.created_at DESC`
        )
        .all();

      res.json({ roles, permissions, matrix, overrides });
    }
  );

  app.put(
    '/api/admin/permissions/matrix',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const updates = req.body?.matrix as Record<string, Record<string, boolean>> | undefined;
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Invalid matrix payload', code: 'INVALID_PAYLOAD' });
      }

      const configurableRoleIds = getAllConfigurableRoleIds(db);
      const beforeMatrix: Record<string, Record<string, boolean>> = {};
      for (const rid of configurableRoleIds) {
        beforeMatrix[rid] = getRolePermissionMap(db, rid) as Record<string, boolean>;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const stmt = db.prepare(
          `INSERT INTO role_permissions (role_id, permission_key, allowed)
           VALUES (?, ?, ?)
           ON CONFLICT(role_id, permission_key) DO UPDATE SET allowed = excluded.allowed`
        );

        const afterMatrix: Record<string, Record<string, boolean>> = {};
        for (const roleId of configurableRoleIds) {
          if (!updates[roleId]) {
            afterMatrix[roleId] = beforeMatrix[roleId];
            continue;
          }
          afterMatrix[roleId] = {};
          const incomingRole = updates[roleId];
          for (const perm of ALL_PERMISSIONS) {
            const val = Boolean(incomingRole[perm]);
            afterMatrix[roleId][perm] = val;
            stmt.run(roleId, perm, val ? 1 : 0);
          }
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'ROLE_PERMISSIONS_UPDATED',
          targetType: 'role_permissions',
          targetId: 'matrix',
          summary: `${actor.username} updated role permission matrix`,
          beforeObj: beforeMatrix,
          afterObj: afterMatrix,
        });
        db.exec('COMMIT');
        res.json({ ok: true, matrix: afterMatrix });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.post(
    '/api/admin/overrides',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const { userId, scope, targetId, permissionKey, effect, reason } = req.body || {};

      if (!['GLOBAL', 'CATEGORY', 'ARCHIVE'].includes(scope)) {
        return res.status(400).json({ error: 'Invalid override scope', code: 'INVALID_SCOPE' });
      }
      if (!['ALLOW', 'DENY'].includes(effect)) {
        return res.status(400).json({ error: 'Override effect must be ALLOW or DENY', code: 'INVALID_EFFECT' });
      }
      const userExists = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(String(userId || '')) as any;
      if (!userExists) {
        return res.status(404).json({ error: 'Target user not found', code: 'NOT_FOUND' });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO user_permission_overrides (id, user_id, scope, target_id, permission_key, effect, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        userExists.id,
        scope,
        targetId || null,
        permissionKey || null,
        effect,
        String(reason || '').trim(),
        actor.id,
        now
      );

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'USER_OVERRIDE_CREATED',
        targetType: 'user_override',
        targetId: id,
        summary: `${actor.username} set ${effect} override (${scope}) for ${userExists.username}`,
        afterObj: { userId: userExists.id, scope, targetId, permissionKey, effect, reason },
      });

      res.status(201).json({ id });
    }
  );

  app.delete(
    '/api/admin/overrides/:id',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const id = String(req.params.id);
      const existing = db.prepare(`SELECT * FROM user_permission_overrides WHERE id = ?`).get(id) as any;
      if (!existing) return res.status(404).json({ error: 'Override not found', code: 'NOT_FOUND' });

      db.prepare(`DELETE FROM user_permission_overrides WHERE id = ?`).run(id);
      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'USER_OVERRIDE_DELETED',
        targetType: 'user_override',
        targetId: id,
        summary: `${actor.username} removed override ${id}`,
        beforeObj: existing,
      });
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/admin/permissions/simulate',
    requireAuth,
    requireAdminCapability('admin.permissions'),
    (req: AuthedRequest, res: Response) => {
      const { userId, permission, categoryId, subcategoryId, archiveId } = req.body || {};
      const row = db
        .prepare(
          `SELECT u.id, u.username, u.key_type, u.avatar_url, u.rank, u.status, u.mfa_enabled, ar.profile as admin_profile
           FROM users u LEFT JOIN admin_roles ar ON ar.user_id = u.id WHERE u.id = ?`
        )
        .get(String(userId || '')) as any;
      if (!row) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

      const result = evaluatePermissionForUser(
        db,
        {
          id: row.id,
          username: row.username,
          avatarUrl: row.avatar_url,
          rank: row.rank,
          adminProfile: row.admin_profile,
          keyType: row.key_type || 'MEMBER',
          customRoles: getUserCustomRoles(db, row.id),
          status: row.status,
          preferredLang: 'tr',
          mfaEnabled: row.mfa_enabled === 1,
          sessionId: 'sim',
        },
        permission as PermissionKey,
        {
          categoryId: categoryId || null,
          subcategoryId: subcategoryId || null,
          archiveId: archiveId || null,
        }
      );
      res.json({ result });
    }
  );

  // Category & Subcategory Management
  app.get(
    '/api/admin/categories',
    requireAuth,
    requireAdminCapability('admin.categories'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC`).all() as any[];
      const configurableRoles = getAllConfigurableRoleIds(db);

      const categories = rows.map((c) => {
        const archiveCount = (
          db
            .prepare(`SELECT COUNT(*) as cnt FROM archives WHERE category_id = ? OR subcategory_id = ?`)
            .get(c.id, c.id) as { cnt: number }
        ).cnt;
        const ruleRows = db
          .prepare(`SELECT role_id, effect FROM category_permissions WHERE category_id = ?`)
          .all(c.id) as Array<{ role_id: string; effect: RuleEffect }>;
        const roleRules: Record<string, RuleEffect> = {};
        for (const rid of configurableRoles) {
          roleRules[rid] = 'INHERIT';
        }
        for (const rr of ruleRows) roleRules[rr.role_id] = rr.effect;

        return {
          id: c.id,
          slug: c.slug,
          nameTr: c.name_tr,
          nameEn: c.name_en,
          descriptionTr: c.description_tr,
          descriptionEn: c.description_en,
          icon: c.icon,
          coverImageUrl: c.cover_image_url,
          accentColor: c.accent_color,
          parentId: c.parent_id,
          visibility: c.visibility,
          sortOrder: c.sort_order,
          archiveCount,
          roleRules,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        };
      });
      res.json({ categories });
    }
  );

  app.post(
    '/api/admin/categories',
    requireAuth,
    requireAdminCapability('admin.categories'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const body = req.body || {};
      const nameTr = String(body.nameTr || body.name || '').trim();
      const nameEn = String(body.nameEn || body.name || '').trim();
      if (!nameTr && !nameEn) {
        return res.status(400).json({ error: 'Category name is required', code: 'NAME_REQUIRED' });
      }

      const rawSlug = slugify(String(body.slug || nameEn || nameTr));
      if (!rawSlug) {
        return res.status(400).json({ error: 'Valid URL slug is required', code: 'INVALID_SLUG' });
      }

      const slugConflict = db.prepare(`SELECT id FROM categories WHERE slug = ?`).get(rawSlug);
      if (slugConflict) {
        return res.status(409).json({ error: 'Category slug already exists', code: 'SLUG_EXISTS' });
      }

      const parentId = body.parentId ? String(body.parentId).trim() : null;
      if (parentId) {
        const parentRow = db.prepare(`SELECT id, parent_id FROM categories WHERE id = ?`).get(parentId) as any;
        if (!parentRow) {
          return res.status(400).json({ error: 'Parent category does not exist', code: 'INVALID_PARENT' });
        }
        if (parentRow.parent_id) {
          return res.status(400).json({
            error: 'Subcategories can only be nested under top-level categories',
            code: 'NESTING_LIMIT',
          });
        }
      }

      const id = `${parentId ? 'sub' : 'cat'}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const now = new Date().toISOString();
      const visibility = ['PUBLIC', 'HIDDEN', 'ARCHIVED'].includes(body.visibility)
        ? body.visibility
        : 'PUBLIC';

      const configurableRoles = getAllConfigurableRoleIds(db);

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `INSERT INTO categories (id, slug, name_tr, name_en, description_tr, description_en, icon, cover_image_url, accent_color, parent_id, visibility, sort_order, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          rawSlug,
          nameTr || nameEn,
          nameEn || nameTr,
          String(body.descriptionTr || body.description || '').trim(),
          String(body.descriptionEn || body.description || '').trim(),
          String(body.icon || 'Archive').trim().slice(0, 40),
          String(body.coverImageUrl || '').trim().slice(0, 500),
          String(body.accentColor || '#B89B63').trim().slice(0, 24),
          parentId,
          visibility,
          Number(body.sortOrder ?? 0),
          actor.id,
          now,
          now
        );

        const roleRules = body.roleRules || {};
        const permStmt = db.prepare(
          `INSERT INTO category_permissions (category_id, role_id, effect) VALUES (?, ?, ?)`
        );
        for (const roleId of configurableRoles) {
          const eff = ['ALLOW', 'DENY', 'INHERIT'].includes(roleRules[roleId])
            ? roleRules[roleId]
            : 'INHERIT';
          permStmt.run(id, roleId, eff);
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: parentId ? 'SUBCATEGORY_CREATED' : 'CATEGORY_CREATED',
          targetType: 'category',
          targetId: id,
          summary: `${actor.username} created ${parentId ? 'subcategory' : 'category'} "${nameEn || nameTr}" (${rawSlug})`,
          afterObj: { id, slug: rawSlug, parentId, nameTr, nameEn, visibility, roleRules },
        });
        db.exec('COMMIT');
        res.status(201).json({ id, slug: rawSlug });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.patch(
    '/api/admin/categories/:id',
    requireAuth,
    requireAdminCapability('admin.categories'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const id = String(req.params.id);
      const existing = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as any;
      if (!existing) return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });

      const body = req.body || {};
      const nextSlug = body.slug ? slugify(String(body.slug)) : existing.slug;
      if (nextSlug !== existing.slug) {
        const conflict = db.prepare(`SELECT id FROM categories WHERE slug = ? AND id != ?`).get(nextSlug, id);
        if (conflict) return res.status(409).json({ error: 'Slug already in use', code: 'SLUG_EXISTS' });
      }

      const nextParentId = body.parentId !== undefined ? body.parentId || null : existing.parent_id;
      if (nextParentId) {
        if (nextParentId === id) {
          return res.status(400).json({ error: 'Category cannot be its own parent', code: 'INVALID_PARENT' });
        }
        const parentRow = db.prepare(`SELECT id, parent_id FROM categories WHERE id = ?`).get(nextParentId) as any;
        if (!parentRow || parentRow.parent_id) {
          return res.status(400).json({ error: 'Invalid parent category', code: 'INVALID_PARENT' });
        }
      }

      const now = new Date().toISOString();
      const configurableRoles = getAllConfigurableRoleIds(db);

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `UPDATE categories
           SET slug = ?, name_tr = ?, name_en = ?, description_tr = ?, description_en = ?,
               icon = ?, cover_image_url = ?, accent_color = ?, parent_id = ?, visibility = ?, sort_order = ?, updated_at = ?
           WHERE id = ?`
        ).run(
          nextSlug,
          body.nameTr ?? existing.name_tr,
          body.nameEn ?? existing.name_en,
          body.descriptionTr ?? existing.description_tr,
          body.descriptionEn ?? existing.description_en,
          body.icon ?? existing.icon,
          body.coverImageUrl ?? existing.cover_image_url,
          body.accentColor ?? existing.accent_color,
          nextParentId,
          ['PUBLIC', 'HIDDEN', 'ARCHIVED'].includes(body.visibility) ? body.visibility : existing.visibility,
          body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order,
          now,
          id
        );

        if (body.roleRules && typeof body.roleRules === 'object') {
          const stmt = db.prepare(
            `INSERT INTO category_permissions (category_id, role_id, effect)
             VALUES (?, ?, ?)
             ON CONFLICT(category_id, role_id) DO UPDATE SET effect = excluded.effect`
          );
          for (const roleId of configurableRoles) {
            if (body.roleRules[roleId] === undefined) continue;
            const eff = ['ALLOW', 'DENY', 'INHERIT'].includes(body.roleRules[roleId])
              ? body.roleRules[roleId]
              : 'INHERIT';
            stmt.run(id, roleId, eff);
          }
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'CATEGORY_UPDATED',
          targetType: 'category',
          targetId: id,
          summary: `${actor.username} updated category ${existing.slug}`,
          beforeObj: existing,
          afterObj: body,
        });
        db.exec('COMMIT');
        res.json({ ok: true });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.put(
    '/api/admin/categories/reorder',
    requireAuth,
    requireAdminCapability('admin.categories'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const orderedIds = Array.isArray(req.body?.orderedIds) ? (req.body.orderedIds as string[]) : [];
      const stmt = db.prepare(`UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?`);
      const now = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        orderedIds.forEach((cid, idx) => stmt.run(idx, now, cid));
        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'CATEGORIES_REORDERED',
          targetType: 'category',
          summary: `${actor.username} reordered ${orderedIds.length} categories`,
        });
        db.exec('COMMIT');
        res.json({ ok: true });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.delete(
    '/api/admin/categories/:id',
    requireAuth,
    requireAdminCapability('admin.categories'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const id = String(req.params.id);
      const existing = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as any;
      if (!existing) return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });

      const archiveCount = (
        db
          .prepare(`SELECT COUNT(*) as c FROM archives WHERE category_id = ? OR subcategory_id = ?`)
          .get(id, id) as { c: number }
      ).c;
      const childCount = (
        db.prepare(`SELECT COUNT(*) as c FROM categories WHERE parent_id = ?`).get(id) as { c: number }
      ).c;

      if (archiveCount > 0 || childCount > 0) {
        return res.status(409).json({
          error: 'Category contains archives or subcategories; reassign or remove them before deleting.',
          code: 'CATEGORY_NOT_EMPTY',
          archiveCount,
          childCount,
        });
      }

      db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: existing.parent_id ? 'SUBCATEGORY_DELETED' : 'CATEGORY_DELETED',
        targetType: 'category',
        targetId: id,
        summary: `${actor.username} deleted empty ${existing.parent_id ? 'subcategory' : 'category'} ${existing.slug}`,
        beforeObj: existing,
      });
      res.json({ ok: true });
    }
  );

  // Archive Management (includes sourceInfo, isFeatured, cascading subcategory check, DRAFT/PUBLISHED/HIDDEN/ARCHIVED)
  app.get(
    '/api/admin/archives',
    requireAuth,
    requireAdminCapability('admin.archives'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db.prepare(`SELECT * FROM archives ORDER BY created_at DESC`).all() as any[];
      const configurableRoles = getAllConfigurableRoleIds(db);

      const archives = rows.map((a) => {
        const tags = (
          db
            .prepare(`SELECT t.name FROM tags t JOIN archive_tags at ON at.tag_id = t.id WHERE at.archive_id = ?`)
            .all(a.id) as Array<{ name: string }>
        ).map((t) => t.name);
        const files = (
          db
            .prepare(
              `SELECT id, archive_id, title, description, download_permission, original_name, mime_type, extension, size_bytes, sha256, scan_status, download_count, created_at
               FROM archive_files WHERE archive_id = ? ORDER BY created_at ASC`
            )
            .all(a.id) as any[]
        ).map((f) => ({
          id: f.id,
          archiveId: f.archive_id,
          title: f.title || f.original_name,
          description: f.description || '',
          downloadPermission: f.download_permission || 'INHERIT',
          originalName: f.original_name,
          mimeType: f.mime_type,
          extension: f.extension,
          sizeBytes: f.size_bytes,
          sha256: f.sha256,
          scanStatus: f.scan_status,
          downloadCount: f.download_count,
          createdAt: f.created_at,
        }));
        const ruleRows = db
          .prepare(`SELECT role_id, effect FROM archive_permissions WHERE archive_id = ?`)
          .all(a.id) as Array<{ role_id: string; effect: RuleEffect }>;
        const roleRules: Record<string, RuleEffect> = {};
        for (const rid of configurableRoles) roleRules[rid] = 'INHERIT';
        for (const rr of ruleRows) roleRules[rr.role_id] = rr.effect;

        return {
          id: a.id,
          slug: a.slug,
          categoryId: a.category_id,
          subcategoryId: a.subcategory_id,
          titleTr: a.title_tr,
          titleEn: a.title_en,
          shortDescTr: a.short_desc_tr,
          shortDescEn: a.short_desc_en,
          longDescTr: a.long_desc_tr,
          longDescEn: a.long_desc_en,
          sourceInfo: a.source_info || '',
          coverImageUrl: a.cover_image_url,
          accessLevel: a.access_level,
          searchVisible: a.search_visible === 1,
          isFeatured: a.is_featured === 1,
          status: a.status,
          publishedAt: a.published_at,
          viewCount: a.view_count,
          tags,
          files,
          roleRules,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
        };
      });
      res.json({ archives });
    }
  );

  app.post(
    '/api/admin/archives',
    requireAuth,
    requireAdminCapability('admin.archives'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const body = req.body || {};

      const catCount = (db.prepare(`SELECT COUNT(*) as c FROM categories`).get() as { c: number }).c;
      if (catCount === 0) {
        return res.status(400).json({
          error: 'At least one category must be created before creating an archive.',
          code: 'CATEGORY_REQUIRED',
        });
      }

      const categoryId = String(body.categoryId || '').trim();
      const catRow = db.prepare(`SELECT id FROM categories WHERE id = ?`).get(categoryId);
      if (!catRow) {
        return res.status(400).json({ error: 'Selected category does not exist', code: 'INVALID_CATEGORY' });
      }

      const subcategoryId: string | null = body.subcategoryId ? String(body.subcategoryId).trim() : null;
      if (subcategoryId) {
        const subRow = db.prepare(`SELECT id, parent_id FROM categories WHERE id = ?`).get(subcategoryId) as any;
        if (!subRow || (subRow.parent_id && subRow.parent_id !== categoryId)) {
          return res.status(400).json({
            error: 'Selected subcategory does not belong to the chosen category',
            code: 'INVALID_SUBCATEGORY',
          });
        }
      }

      const titleTr = String(body.titleTr || body.title || '').trim();
      const titleEn = String(body.titleEn || body.title || '').trim();
      if (!titleTr && !titleEn) {
        return res.status(400).json({ error: 'Archive title is required', code: 'TITLE_REQUIRED' });
      }

      const baseSlug = slugify(String(body.slug || titleEn || titleTr)) || `archive-${Date.now()}`;
      const existingSlug = db.prepare(`SELECT id FROM archives WHERE slug = ?`).get(baseSlug);
      const finalSlug = existingSlug ? `${baseSlug}-${crypto.randomBytes(2).toString('hex')}` : baseSlug;

      const status: PublicationStatus = ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'].includes(body.status)
        ? body.status
        : 'DRAFT';
      const now = new Date().toISOString();
      const publishedAt = status === 'PUBLISHED' ? body.publishedAt || now : body.publishedAt || null;
      const isFeatured = body.isFeatured ? 1 : 0;
      const id = `arc_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const configurableRoles = getAllConfigurableRoleIds(db);

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `INSERT INTO archives (id, slug, category_id, subcategory_id, title_tr, title_en, short_desc_tr, short_desc_en, long_desc_tr, long_desc_en, source_info, cover_image_url, access_level, search_visible, is_featured, status, published_at, view_count, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
        ).run(
          id,
          finalSlug,
          categoryId,
          subcategoryId,
          titleTr || titleEn,
          titleEn || titleTr,
          String(body.shortDescTr || '').trim(),
          String(body.shortDescEn || '').trim(),
          String(body.longDescTr || '').trim(),
          String(body.longDescEn || '').trim(),
          String(body.sourceInfo || '').trim().slice(0, 1000),
          String(body.coverImageUrl || '').trim().slice(0, 500),
          String(body.accessLevel || 'STANDARD').trim(),
          body.searchVisible === false ? 0 : 1,
          isFeatured,
          status,
          publishedAt,
          actor.id,
          now,
          now
        );

        const tagsInput = Array.isArray(body.tags)
          ? (body.tags as string[])
          : String(body.tags || '')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);

        for (const tagName of tagsInput.slice(0, 15)) {
          const cleanTag = tagName.trim().slice(0, 40);
          if (!cleanTag) continue;
          let tagRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(cleanTag) as { id: string } | undefined;
          if (!tagRow) {
            const tid = `tag_${crypto.randomUUID().slice(0, 10)}`;
            db.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).run(tid, cleanTag);
            tagRow = { id: tid };
          }
          db.prepare(`INSERT OR IGNORE INTO archive_tags (archive_id, tag_id) VALUES (?, ?)`).run(id, tagRow.id);
        }

        const roleRules = body.roleRules || {};
        const permStmt = db.prepare(
          `INSERT INTO archive_permissions (archive_id, role_id, effect) VALUES (?, ?, ?)`
        );
        for (const roleId of configurableRoles) {
          const eff = ['ALLOW', 'DENY', 'INHERIT'].includes(roleRules[roleId])
            ? roleRules[roleId]
            : 'INHERIT';
          permStmt.run(id, roleId, eff);
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'ARCHIVE_CREATED',
          targetType: 'archive',
          targetId: id,
          summary: `${actor.username} created archive "${titleEn || titleTr}" (${status}) in category ${categoryId}`,
          afterObj: { id, slug: finalSlug, categoryId, subcategoryId, status, isFeatured: Boolean(isFeatured) },
        });
        db.exec('COMMIT');
        res.status(201).json({ id, slug: finalSlug });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.patch(
    '/api/admin/archives/:id',
    requireAuth,
    requireAdminCapability('admin.archives'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const id = String(req.params.id);
      const existing = db.prepare(`SELECT * FROM archives WHERE id = ?`).get(id) as any;
      if (!existing) return res.status(404).json({ error: 'Archive not found', code: 'NOT_FOUND' });

      const body = req.body || {};
      const nextCategoryId = body.categoryId || existing.category_id;
      const nextSubcategoryId =
        body.subcategoryId !== undefined ? body.subcategoryId || null : existing.subcategory_id;

      if (nextSubcategoryId) {
        const subRow = db.prepare(`SELECT id, parent_id FROM categories WHERE id = ?`).get(nextSubcategoryId) as any;
        if (!subRow || (subRow.parent_id && subRow.parent_id !== nextCategoryId)) {
          return res.status(400).json({
            error: 'Selected subcategory does not belong to the chosen category',
            code: 'INVALID_SUBCATEGORY',
          });
        }
      }

      const nextStatus: PublicationStatus = ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'].includes(body.status)
        ? body.status
        : existing.status;
      const now = new Date().toISOString();
      const publishedAt =
        nextStatus === 'PUBLISHED' && !existing.published_at ? now : body.publishedAt ?? existing.published_at;
      const nextIsFeatured =
        body.isFeatured !== undefined ? (body.isFeatured ? 1 : 0) : existing.is_featured ?? 0;
      const configurableRoles = getAllConfigurableRoleIds(db);

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `UPDATE archives
           SET category_id = ?, subcategory_id = ?, title_tr = ?, title_en = ?,
               short_desc_tr = ?, short_desc_en = ?, long_desc_tr = ?, long_desc_en = ?,
               source_info = ?, cover_image_url = ?, access_level = ?, search_visible = ?, is_featured = ?,
               status = ?, published_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(
          nextCategoryId,
          nextSubcategoryId,
          body.titleTr ?? existing.title_tr,
          body.titleEn ?? existing.title_en,
          body.shortDescTr ?? existing.short_desc_tr,
          body.shortDescEn ?? existing.short_desc_en,
          body.longDescTr ?? existing.long_desc_tr,
          body.longDescEn ?? existing.long_desc_en,
          body.sourceInfo !== undefined ? String(body.sourceInfo).trim().slice(0, 1000) : existing.source_info || '',
          body.coverImageUrl ?? existing.cover_image_url,
          body.accessLevel ?? existing.access_level,
          body.searchVisible !== undefined ? (body.searchVisible ? 1 : 0) : existing.search_visible,
          nextIsFeatured,
          nextStatus,
          publishedAt,
          now,
          id
        );

        if (body.tags !== undefined) {
          db.prepare(`DELETE FROM archive_tags WHERE archive_id = ?`).run(id);
          const tagsInput = Array.isArray(body.tags)
            ? (body.tags as string[])
            : String(body.tags)
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
          for (const tagName of tagsInput.slice(0, 15)) {
            const cleanTag = tagName.trim().slice(0, 40);
            if (!cleanTag) continue;
            let tagRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(cleanTag) as { id: string } | undefined;
            if (!tagRow) {
              const tid = `tag_${crypto.randomUUID().slice(0, 10)}`;
              db.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).run(tid, cleanTag);
              tagRow = { id: tid };
            }
            db.prepare(`INSERT OR IGNORE INTO archive_tags (archive_id, tag_id) VALUES (?, ?)`).run(id, tagRow.id);
          }
        }

        if (body.roleRules && typeof body.roleRules === 'object') {
          const stmt = db.prepare(
            `INSERT INTO archive_permissions (archive_id, role_id, effect)
             VALUES (?, ?, ?)
             ON CONFLICT(archive_id, role_id) DO UPDATE SET effect = excluded.effect`
          );
          for (const roleId of configurableRoles) {
            if (body.roleRules[roleId] === undefined) continue;
            const eff = ['ALLOW', 'DENY', 'INHERIT'].includes(body.roleRules[roleId])
              ? body.roleRules[roleId]
              : 'INHERIT';
            stmt.run(id, roleId, eff);
          }
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'ARCHIVE_UPDATED',
          targetType: 'archive',
          targetId: id,
          summary: `${actor.username} updated archive ${existing.slug}`,
          beforeObj: { status: existing.status, categoryId: existing.category_id, isFeatured: Boolean(existing.is_featured) },
          afterObj: { status: nextStatus, categoryId: nextCategoryId, isFeatured: Boolean(nextIsFeatured) },
        });
        db.exec('COMMIT');
        res.json({ ok: true });
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    }
  );

  app.delete(
    '/api/admin/archives/:id',
    requireAuth,
    requireAdminCapability('admin.archives'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const id = String(req.params.id);
      const existing = db.prepare(`SELECT * FROM archives WHERE id = ?`).get(id) as any;
      if (!existing) return res.status(404).json({ error: 'Archive not found', code: 'NOT_FOUND' });

      const files = db
        .prepare(`SELECT stored_name FROM archive_files WHERE archive_id = ?`)
        .all(id) as Array<{ stored_name: string }>;

      db.prepare(`DELETE FROM archives WHERE id = ?`).run(id);
      for (const f of files) {
        const p = path.resolve(privateStorageDir, path.basename(f.stored_name));
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'ARCHIVE_DELETED',
        targetType: 'archive',
        targetId: id,
        summary: `${actor.username} deleted archive ${existing.slug}`,
        beforeObj: { titleEn: existing.title_en, slug: existing.slug },
      });
      res.json({ ok: true });
    }
  );

  // Secure Disk-Streamed Private File Upload & File Manager
  app.get(
    '/api/admin/files',
    requireAuth,
    requireAdminCapability('admin.files'),
    (_req: AuthedRequest, res: Response) => {
      const files = db
        .prepare(
          `SELECT f.*, a.title_tr, a.title_en, a.slug as archive_slug, u.username as uploaded_by_name
           FROM archive_files f
           JOIN archives a ON a.id = f.archive_id
           LEFT JOIN users u ON u.id = f.uploaded_by
           ORDER BY f.created_at DESC`
        )
        .all() as any[];

      res.json({
        files: files.map((f) => ({
          ...f,
          title: f.title || f.original_name,
          description: f.description || '',
          downloadPermission: (f.download_permission || 'INHERIT') as FileDownloadPermission,
        })),
      });
    }
  );

  const handleFileUpload = async (req: AuthedRequest, res: Response, archiveIdInput: string) => {
    const actor = req.authUser!;
    const archiveId = String(archiveIdInput || '').trim();
    const uploaded = req.file;

    const cleanupTemp = () => {
      if (uploaded?.path && fs.existsSync(uploaded.path)) {
        fs.unlinkSync(uploaded.path);
      }
    };

    try {
      if (!uploaded) {
        return res.status(400).json({ error: 'No file uploaded', code: 'FILE_REQUIRED' });
      }
      if (!archiveId) {
        cleanupTemp();
        return res.status(400).json({ error: 'Target archive ID is required', code: 'ARCHIVE_REQUIRED' });
      }

      const archive = db.prepare(`SELECT id, slug FROM archives WHERE id = ?`).get(archiveId) as any;
      if (!archive) {
        cleanupTemp();
        return res.status(404).json({ error: 'Archive not found', code: 'ARCHIVE_NOT_FOUND' });
      }

      const fd = fs.openSync(uploaded.path, 'r');
      const headBuf = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, headBuf, 0, 16, 0);
      fs.closeSync(fd);

      const validation = validateUploadFile(
        uploaded.originalname,
        uploaded.mimetype,
        uploaded.size,
        headBuf.subarray(0, bytesRead)
      );
      if (!validation.valid) {
        cleanupTemp();
        return res.status(400).json({ error: validation.reason, code: 'UNSAFE_FILE' });
      }

      const scanResult = await runMalwareScanHook(uploaded.path, validation.extension);
      if (!scanResult.clean) {
        cleanupTemp();
        return res.status(400).json({
          error: scanResult.reason || 'File failed security inspection',
          code: 'MALWARE_SCAN_REJECTED',
        });
      }

      const hash = crypto.createHash('sha256');
      const fileData = fs.readFileSync(uploaded.path);
      hash.update(fileData);
      const sha256 = hash.digest('hex');

      const fileId = `fil_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const storedName = `${fileId}_${crypto.randomBytes(6).toString('hex')}.${validation.extension}`;
      const finalPath = path.resolve(privateStorageDir, storedName);

      fs.renameSync(uploaded.path, finalPath);
      const now = new Date().toISOString();

      const title = String(req.body?.title || '').trim().slice(0, 200) || validation.sanitizedName;
      const description = String(req.body?.description || '').trim().slice(0, 800);
      const rawPerm = String(req.body?.downloadPermission || 'INHERIT').toUpperCase();
      const downloadPermission: FileDownloadPermission = ['INHERIT', 'ALLOW', 'DENY'].includes(rawPerm)
        ? (rawPerm as FileDownloadPermission)
        : 'INHERIT';

      db.prepare(
        `INSERT INTO archive_files (id, archive_id, title, description, download_permission, original_name, stored_name, mime_type, extension, size_bytes, sha256, scan_status, download_count, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLEAN', 0, ?, ?)`
      ).run(
        fileId,
        archiveId,
        title,
        description,
        downloadPermission,
        validation.sanitizedName,
        storedName,
        uploaded.mimetype,
        validation.extension,
        uploaded.size,
        sha256,
        actor.id,
        now
      );

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'FILE_UPLOADED',
        targetType: 'archive_file',
        targetId: fileId,
        summary: `${actor.username} uploaded ${validation.sanitizedName} to archive ${archive.slug} (scan: ${scanResult.engine})`,
        afterObj: {
          fileId,
          archiveId,
          title,
          downloadPermission,
          originalName: validation.sanitizedName,
          sizeBytes: uploaded.size,
          sha256,
        },
      });

      res.status(201).json({
        file: {
          id: fileId,
          archiveId,
          title,
          description,
          downloadPermission,
          originalName: validation.sanitizedName,
          mimeType: uploaded.mimetype,
          extension: validation.extension,
          sizeBytes: uploaded.size,
          sha256,
          scanStatus: 'CLEAN',
          downloadCount: 0,
          createdAt: now,
        },
      });
    } catch (err) {
      cleanupTemp();
      console.error('Upload error:', err);
      res.status(500).json({ error: 'File upload failed', code: 'UPLOAD_FAILED' });
    }
  };

  app.post(
    '/api/admin/archives/:archiveId/files',
    requireAuth,
    requireAdminCapability('admin.files'),
    upload.single('file'),
    async (req: AuthedRequest, res: Response) => {
      await handleFileUpload(req, res, String(req.params.archiveId || ''));
    }
  );

  app.post(
    '/api/admin/files',
    requireAuth,
    requireAdminCapability('admin.files'),
    upload.single('file'),
    async (req: AuthedRequest, res: Response) => {
      await handleFileUpload(req, res, String(req.body?.archiveId || ''));
    }
  );

  app.patch(
    '/api/admin/files/:fileId',
    requireAuth,
    requireAdminCapability('admin.files'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const fileId = String(req.params.fileId);
      const existing = db.prepare(`SELECT * FROM archive_files WHERE id = ?`).get(fileId) as any;
      if (!existing) return res.status(404).json({ error: 'File not found', code: 'NOT_FOUND' });

      const body = req.body || {};
      const nextArchiveId = body.archiveId ? String(body.archiveId).trim() : existing.archive_id;
      if (nextArchiveId !== existing.archive_id) {
        const targetArchive = db.prepare(`SELECT id FROM archives WHERE id = ?`).get(nextArchiveId);
        if (!targetArchive) {
          return res.status(400).json({ error: 'Target archive does not exist', code: 'ARCHIVE_NOT_FOUND' });
        }
      }

      const nextTitle =
        body.title !== undefined
          ? String(body.title).trim().slice(0, 200) || existing.original_name
          : existing.title || existing.original_name;
      const nextDescription =
        body.description !== undefined ? String(body.description).trim().slice(0, 800) : existing.description || '';
      const rawPerm = body.downloadPermission
        ? String(body.downloadPermission).toUpperCase()
        : existing.download_permission || 'INHERIT';
      const nextPerm: FileDownloadPermission = ['INHERIT', 'ALLOW', 'DENY'].includes(rawPerm)
        ? (rawPerm as FileDownloadPermission)
        : 'INHERIT';

      db.prepare(
        `UPDATE archive_files SET archive_id = ?, title = ?, description = ?, download_permission = ? WHERE id = ?`
      ).run(nextArchiveId, nextTitle, nextDescription, nextPerm, fileId);

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'FILE_METADATA_UPDATED',
        targetType: 'archive_file',
        targetId: fileId,
        summary: `${actor.username} updated file ${existing.original_name} (permission: ${nextPerm})`,
        beforeObj: {
          archiveId: existing.archive_id,
          title: existing.title,
          downloadPermission: existing.download_permission,
        },
        afterObj: {
          archiveId: nextArchiveId,
          title: nextTitle,
          downloadPermission: nextPerm,
        },
      });

      res.json({
        ok: true,
        file: {
          id: fileId,
          archiveId: nextArchiveId,
          title: nextTitle,
          description: nextDescription,
          downloadPermission: nextPerm,
        },
      });
    }
  );

  app.delete(
    '/api/admin/files/:fileId',
    requireAuth,
    requireAdminCapability('admin.files'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const fileId = String(req.params.fileId);
      const file = db.prepare(`SELECT * FROM archive_files WHERE id = ?`).get(fileId) as any;
      if (!file) return res.status(404).json({ error: 'File not found', code: 'NOT_FOUND' });

      db.prepare(`DELETE FROM archive_files WHERE id = ?`).run(fileId);
      const diskPath = path.resolve(privateStorageDir, path.basename(file.stored_name));
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'FILE_DELETED',
        targetType: 'archive_file',
        targetId: fileId,
        summary: `${actor.username} deleted file ${file.original_name}`,
        beforeObj: { originalName: file.original_name, sha256: file.sha256 },
      });
      res.json({ ok: true });
    }
  );

  // Content Moderation & Reports Queue
  app.get(
    '/api/admin/reports',
    requireAuth,
    requireAdminCapability('admin.reports'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT r.*, a.title_tr as archive_title_tr, a.title_en as archive_title_en, a.slug as archive_slug, a.status as archive_status,
                  u.username as reporter_username, rev.username as reviewed_by_username
           FROM content_reports r
           JOIN archives a ON a.id = r.archive_id
           JOIN users u ON u.id = r.reporter_id
           LEFT JOIN users rev ON rev.id = r.reviewed_by
           ORDER BY CASE r.status WHEN 'OPEN' THEN 0 ELSE 1 END, r.created_at DESC`
        )
        .all() as any[];

      res.json({
        reports: rows.map((r) => ({
          id: r.id,
          archiveId: r.archive_id,
          archiveSlug: r.archive_slug,
          archiveTitleTr: r.archive_title_tr,
          archiveTitleEn: r.archive_title_en,
          archiveStatus: r.archive_status,
          reporterId: r.reporter_id,
          reporterUsername: r.reporter_username,
          category: r.category,
          description: r.description,
          status: r.status,
          actionTaken: r.action_taken,
          resolutionNote: r.resolution_note,
          reviewedByName: r.reviewed_by_username || null,
          reviewedAt: r.reviewed_at,
          createdAt: r.created_at,
        })),
      });
    }
  );

  app.patch(
    '/api/admin/reports/:id',
    requireAuth,
    requireAdminCapability('admin.reports'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const reportId = String(req.params.id);
      const action = String(req.body?.action || '').toUpperCase();
      const resolutionNote = String(req.body?.resolutionNote || '').trim();

      if (!['DISMISS', 'HIDE_ARCHIVE', 'DELETE_ARCHIVE'].includes(action)) {
        return res.status(400).json({ error: 'Invalid moderation action', code: 'INVALID_ACTION' });
      }
      if (resolutionNote.length < 5) {
        return res.status(400).json({
          error: 'Resolution justification is required (min 5 chars)',
          code: 'REASON_REQUIRED',
        });
      }

      const report = db
        .prepare(
          `SELECT r.*, a.slug as archive_slug, a.title_en as archive_title_en, a.status as archive_status
           FROM content_reports r
           JOIN archives a ON a.id = r.archive_id
           WHERE r.id = ?`
        )
        .get(reportId) as any;

      if (!report) {
        return res.status(404).json({ error: 'Report not found', code: 'NOT_FOUND' });
      }

      const now = new Date().toISOString();
      const filesToUnlink: string[] = [];

      db.exec('BEGIN IMMEDIATE');
      try {
        const nextStatus = action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';

        if (action === 'HIDE_ARCHIVE') {
          db.prepare(`UPDATE archives SET status = 'HIDDEN', updated_at = ? WHERE id = ?`).run(
            now,
            report.archive_id
          );
          db.prepare(
            `UPDATE content_reports SET status = ?, action_taken = ?, resolution_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`
          ).run(nextStatus, action, resolutionNote, actor.id, now, reportId);
        } else if (action === 'DELETE_ARCHIVE') {
          const files = db
            .prepare(`SELECT stored_name FROM archive_files WHERE archive_id = ?`)
            .all(report.archive_id) as Array<{ stored_name: string }>;
          for (const f of files) filesToUnlink.push(f.stored_name);

          db.prepare(`DELETE FROM archives WHERE id = ?`).run(report.archive_id);
        } else {
          db.prepare(
            `UPDATE content_reports SET status = ?, action_taken = ?, resolution_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`
          ).run(nextStatus, action, resolutionNote, actor.id, now, reportId);
        }

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: `MODERATION_${action}`,
          targetType: 'content_report',
          targetId: reportId,
          summary: `${actor.username} executed ${action} on report ${reportId} (archive ${report.archive_slug}): ${resolutionNote}`,
          beforeObj: { reportStatus: report.status, archiveStatus: report.archive_status },
          afterObj: { action, resolutionNote, archiveId: report.archive_id },
        });
        db.exec('COMMIT');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }

      for (const storedName of filesToUnlink) {
        const p = path.resolve(privateStorageDir, path.basename(storedName));
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }

      res.json({ ok: true, action });
    }
  );

  // Security Center
  app.get(
    '/api/admin/security',
    requireAuth,
    requireAdminCapability('admin.security'),
    (_req: AuthedRequest, res: Response) => {
      const events = db.prepare(`SELECT * FROM security_events ORDER BY created_at DESC LIMIT 50`).all();
      const attempts = db.prepare(`SELECT * FROM login_attempts ORDER BY created_at DESC LIMIT 50`).all();
      const activeSessions = db
        .prepare(
          `SELECT s.id, s.user_id, u.username, u.rank, s.ip_address, s.user_agent, s.last_seen_at, s.created_at
           FROM user_sessions s JOIN users u ON u.id = s.user_id
           WHERE s.revoked = 0 ORDER BY s.last_seen_at DESC LIMIT 50`
        )
        .all();
      res.json({ events, attempts, activeSessions });
    }
  );

  // Database Backups (list, create, stream download)
  app.get(
    '/api/admin/backups',
    requireAuth,
    requireAdminCapability('admin.backups'),
    (_req: AuthedRequest, res: Response) => {
      fs.mkdirSync(backupDir, { recursive: true });
      const entries = fs.readdirSync(backupDir, { withFileTypes: true });
      const backups = entries
        .filter((e) => e.isFile() && e.name.endsWith('.db'))
        .map((e) => {
          const st = fs.statSync(path.join(backupDir, e.name));
          return {
            filename: e.name,
            sizeBytes: st.size,
            createdAt: st.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      res.json({ backups });
    }
  );

  app.post(
    '/api/admin/backup',
    requireAuth,
    requireAdminCapability('admin.backups'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      try {
        const createdPath = createDatabaseBackup(db, backupDir, 'manual_backup');
        const filename = path.basename(createdPath);
        const sizeBytes = fs.statSync(createdPath).size;

        appendAuditLog(db, {
          actorId: actor.id,
          actorUsername: actor.username,
          action: 'DATABASE_BACKUP_CREATED',
          targetType: 'database',
          targetId: filename,
          summary: `${actor.username} created database snapshot ${filename} (${sizeBytes} bytes)`,
        });
        res.status(201).json({ filename, sizeBytes, createdAt: new Date().toISOString() });
      } catch (err) {
        console.error('Backup error:', err);
        res.status(500).json({ error: 'Failed to create database backup', code: 'BACKUP_FAILED' });
      }
    }
  );

  app.get(
    '/api/admin/backups/:filename/download',
    requireAuth,
    requireAdminCapability('admin.backups'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const filename = String(req.params.filename || '');
      if (!/^[a-zA-Z0-9._-]+\.db$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid backup filename', code: 'INVALID_FILENAME' });
      }
      const targetPath = path.resolve(backupDir, filename);
      if (!targetPath.startsWith(path.resolve(backupDir) + path.sep) || !fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Backup snapshot not found', code: 'NOT_FOUND' });
      }

      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'DATABASE_BACKUP_DOWNLOADED',
        targetType: 'database',
        targetId: filename,
        summary: `${actor.username} downloaded database snapshot ${filename}`,
      });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      fs.createReadStream(targetPath).pipe(res);
    }
  );

  // Audit Logs + Cryptographic Chain Verification
  app.get(
    '/api/admin/audit-logs',
    requireAuth,
    requireAdminCapability('admin.audit'),
    (req: AuthedRequest, res: Response) => {
      const limit = Math.min(200, Math.max(10, Number(req.query.limit || 100)));
      const actionFilter = String(req.query.action || '').trim();
      const logs = actionFilter
        ? db
            .prepare(`SELECT * FROM audit_logs WHERE action = ? ORDER BY id DESC LIMIT ?`)
            .all(actionFilter, limit)
        : db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?`).all(limit);
      res.json({ logs });
    }
  );

  app.get(
    '/api/admin/audit-logs/verify',
    requireAuth,
    requireAdminCapability('admin.audit'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db.prepare(`SELECT * FROM audit_logs ORDER BY id ASC`).all() as any[];
      const verification = verifyAuditChain(
        rows.map((r) => ({
          actorId: r.actor_id,
          action: r.action,
          targetType: r.target_type,
          targetId: r.target_id,
          summary: r.summary,
          prevHash: r.prev_hash,
          entryHash: r.entry_hash,
          createdAt: r.created_at,
        }))
      );
      res.json({
        totalEntries: rows.length,
        valid: verification.valid,
        brokenIndex: verification.brokenIndex,
      });
    }
  );

  // System Settings & Localization (consolidated into unified admin.settings)
  app.get(
    '/api/admin/settings',
    requireAuth,
    requireAdminCapability('admin.settings'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db.prepare(`SELECT key, value, updated_at FROM system_settings ORDER BY key ASC`).all();
      res.json({ settings: rows });
    }
  );

  app.put(
    '/api/admin/settings',
    requireAuth,
    requireAdminCapability('admin.settings'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const updates = req.body?.settings as Record<string, string> | undefined;
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object', code: 'INVALID_PAYLOAD' });
      }
      const allowedKeys = new Set([
        'default_language',
        'fallback_language',
        'key_only_auth_enforced',
        'captcha_enabled',
        'max_login_attempts_window',
        'signed_url_ttl_seconds',
        'maintenance_mode',
      ]);
      const now = new Date().toISOString();
      const stmt = db.prepare(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      );
      for (const [k, v] of Object.entries(updates)) {
        if (allowedKeys.has(k)) {
          stmt.run(k, String(v).slice(0, 64), now);
        }
      }
      appendAuditLog(db, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: 'SYSTEM_SETTINGS_UPDATED',
        targetType: 'system_settings',
        summary: `${actor.username} updated system configuration`,
        afterObj: updates,
      });
      res.json({ ok: true });
    }
  );

  // Unified Admin capability manifest for the 12-section sidebar
  app.get('/api/admin/capabilities', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    if (user.rank !== 'ADMIN' || user.adminProfile !== 'ADMIN' || user.keyType !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin role required', code: 'FORBIDDEN' });
    }
    const menuKeys = [
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
    ];
    const allowedSections = menuKeys.filter((k) =>
      hasAdminCapability(user.rank, user.adminProfile, `admin.${k}`)
    );
    res.json({ adminProfile: user.adminProfile, allowedSections });
  });
}
