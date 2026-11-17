import crypto from 'node:crypto';
import type { Express, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { AuthedRequest, requireAuth } from '../auth';
import { appendAuditLog } from '../db';
import { canUserAccessArchive } from '../permissionService';
import { Language, ReportCategory } from '../../shared/types';

const VALID_REPORT_CATEGORIES: ReportCategory[] = [
  'COPYRIGHT',
  'MALWARE_OR_UNSAFE',
  'PRIVACY_VIOLATION',
  'ILLEGAL_CONTENT',
  'INACCURATE_OR_SPAM',
  'OTHER',
];

export function registerUserRoutes(app: Express, db: DatabaseSync) {
  app.patch('/api/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const { username, avatarUrl, preferredLang } = req.body || {};
    const now = new Date().toISOString();

    // Explicitly ignore any attempt to change rank, adminProfile, keyType, or status
    let nextUsername = user.username;
    let nextNormalized = user.username.toLowerCase();
    if (typeof username === 'string' && username.trim()) {
      const clean = username.trim();
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(clean)) {
        return res.status(400).json({ error: 'Invalid username format', code: 'INVALID_USERNAME' });
      }
      const normalized = clean.toLowerCase();
      const conflictUser = db
        .prepare(`SELECT id FROM users WHERE username_normalized = ? AND id != ?`)
        .get(normalized, user.id) as { id: string } | undefined;
      const conflictPending = db
        .prepare(`SELECT token FROM pending_registrations WHERE username_normalized = ? AND expires_at > ?`)
        .get(normalized, now) as { token: string } | undefined;
      if (conflictUser || conflictPending) {
        return res.status(409).json({ error: 'Username already taken', code: 'USERNAME_TAKEN' });
      }
      nextUsername = clean;
      nextNormalized = normalized;
    }

    let nextAvatar = user.avatarUrl;
    if (typeof avatarUrl === 'string') {
      const trimmed = avatarUrl.trim();
      if (trimmed && !/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/src/assets/')) {
        return res.status(400).json({ error: 'Invalid avatar URL', code: 'INVALID_AVATAR' });
      }
      nextAvatar = trimmed.slice(0, 400);
    }

    const nextLang: Language =
      preferredLang === 'en' ? 'en' : preferredLang === 'tr' ? 'tr' : user.preferredLang;

    db.prepare(
      `UPDATE users SET username = ?, username_normalized = ?, avatar_url = ?, updated_at = ? WHERE id = ?`
    ).run(nextUsername, nextNormalized, nextAvatar, now, user.id);

    db.prepare(
      `INSERT INTO user_preferences (user_id, preferred_lang, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET preferred_lang = excluded.preferred_lang, updated_at = excluded.updated_at`
    ).run(user.id, nextLang, now);

    res.json({
      user: {
        ...user,
        username: nextUsername,
        avatarUrl: nextAvatar,
        preferredLang: nextLang,
      },
    });
  });

  app.post('/api/security/mfa/setup', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'Sentarika Archive',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const otpauthUrl = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      color: { dark: '#E9E7DF', light: '#090D0C' },
      margin: 2,
      width: 220,
    });

    db.prepare(`UPDATE users SET mfa_secret = ?, updated_at = ? WHERE id = ?`).run(
      secret.base32,
      new Date().toISOString(),
      user.id
    );

    res.json({
      secretBase32: secret.base32,
      otpauthUrl,
      qrDataUrl,
    });
  });

  app.post('/api/security/mfa/enable', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const code = String(req.body?.code || '').trim();
    const row = db
      .prepare(`SELECT mfa_secret FROM users WHERE id = ?`)
      .get(user.id) as { mfa_secret: string | null } | undefined;

    if (!row?.mfa_secret) {
      return res.status(400).json({ error: 'MFA setup not initiated', code: 'MFA_NOT_INITIATED' });
    }

    const totp = new TOTP({
      issuer: 'Sentarika Archive',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: row.mfa_secret,
    });

    if (totp.validate({ token: code, window: 1 }) === null) {
      return res.status(400).json({ error: 'Invalid 6-digit verification code', code: 'MFA_INVALID' });
    }

    db.prepare(`UPDATE users SET mfa_enabled = 1, updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      user.id
    );

    appendAuditLog(db, {
      actorId: user.id,
      actorUsername: user.username,
      action: 'MFA_ENABLED',
      targetType: 'user',
      targetId: user.id,
      summary: `${user.username} activated TOTP MFA`,
    });

    res.json({ mfaEnabled: true });
  });

  app.post('/api/security/mfa/disable', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const code = String(req.body?.code || '').trim();
    const row = db
      .prepare(`SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?`)
      .get(user.id) as { mfa_secret: string | null; mfa_enabled: number } | undefined;

    if (!row || row.mfa_enabled !== 1 || !row.mfa_secret) {
      return res.status(400).json({ error: 'MFA is not enabled', code: 'MFA_NOT_ENABLED' });
    }

    const totp = new TOTP({
      issuer: 'Sentarika Archive',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: row.mfa_secret,
    });
    if (totp.validate({ token: code, window: 1 }) === null) {
      return res.status(400).json({ error: 'Invalid MFA code', code: 'MFA_INVALID' });
    }

    db.prepare(`UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      user.id
    );

    appendAuditLog(db, {
      actorId: user.id,
      actorUsername: user.username,
      action: 'MFA_DISABLED',
      targetType: 'user',
      targetId: user.id,
      summary: `${user.username} disabled TOTP MFA`,
    });

    res.json({ mfaEnabled: false });
  });

  app.get('/api/security/sessions', requireAuth, (req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(
        `SELECT id, ip_address, user_agent, revoked, expires_at, last_seen_at, created_at
         FROM user_sessions
         WHERE user_id = ? AND revoked = 0
         ORDER BY last_seen_at DESC`
      )
      .all(req.authUser!.id) as Array<{
      id: string;
      ip_address: string;
      user_agent: string;
      revoked: number;
      expires_at: string;
      last_seen_at: string;
      created_at: string;
    }>;

    res.json({
      sessions: rows.map((s) => ({
        id: s.id,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        expiresAt: s.expires_at,
        lastSeenAt: s.last_seen_at,
        createdAt: s.created_at,
        isCurrent: s.id === req.authUser!.sessionId,
      })),
    });
  });

  app.delete('/api/security/sessions/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const targetSessionId = String(req.params.id);
    const result = db
      .prepare(`UPDATE user_sessions SET revoked = 1 WHERE id = ? AND user_id = ?`)
      .run(targetSessionId, user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });
    }

    appendAuditLog(db, {
      actorId: user.id,
      actorUsername: user.username,
      action: 'SESSION_REVOKED',
      targetType: 'session',
      targetId: targetSessionId,
      summary: `${user.username} terminated session ${targetSessionId}`,
    });

    res.json({ ok: true });
  });

  app.post('/api/security/sessions/revoke-others', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const result = db
      .prepare(`UPDATE user_sessions SET revoked = 1 WHERE user_id = ? AND id != ?`)
      .run(user.id, user.sessionId);

    appendAuditLog(db, {
      actorId: user.id,
      actorUsername: user.username,
      action: 'SESSIONS_REVOKED_ALL_OTHERS',
      targetType: 'user',
      targetId: user.id,
      summary: `${user.username} revoked ${result.changes} other active sessions`,
    });

    res.json({ revokedCount: result.changes });
  });

  // Member content moderation reporting
  app.post('/api/reports', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const archiveId = String(req.body?.archiveId || '').trim();
    const category = String(req.body?.category || '').trim() as ReportCategory;
    const description = String(req.body?.description || '').trim();

    if (!archiveId) {
      return res.status(400).json({ error: 'Archive ID is required', code: 'ARCHIVE_REQUIRED' });
    }
    if (!VALID_REPORT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid report category', code: 'INVALID_CATEGORY' });
    }
    if (description.length < 10 || description.length > 1000) {
      return res.status(400).json({
        error: 'Report details must be 10-1000 characters',
        code: 'INVALID_DESCRIPTION',
      });
    }

    const archive = db
      .prepare(
        `SELECT a.id, a.slug, a.category_id, a.subcategory_id, a.status, c.visibility as cat_visibility
         FROM archives a
         JOIN categories c ON c.id = a.category_id
         WHERE a.id = ?`
      )
      .get(archiveId) as
      | {
          id: string;
          slug: string;
          category_id: string;
          subcategory_id: string | null;
          status: any;
          cat_visibility: any;
        }
      | undefined;

    if (!archive || !canUserAccessArchive(db, user, archive, archive.cat_visibility).allowed) {
      return res.status(404).json({ error: 'Archive not found or not accessible', code: 'NOT_FOUND' });
    }

    const existingOpen = db
      .prepare(
        `SELECT id FROM content_reports WHERE archive_id = ? AND reporter_id = ? AND status = 'OPEN'`
      )
      .get(archive.id, user.id);
    if (existingOpen) {
      return res.status(409).json({
        error: 'You already have an open report for this archive',
        code: 'DUPLICATE_REPORT',
      });
    }

    const reportId = `rep_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO content_reports (id, archive_id, reporter_id, category, description, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?)`
    ).run(reportId, archive.id, user.id, category, description, now);

    appendAuditLog(db, {
      actorId: user.id,
      actorUsername: user.username,
      action: 'CONTENT_REPORTED',
      targetType: 'content_report',
      targetId: reportId,
      summary: `${user.username} reported archive ${archive.slug} (${category})`,
      afterObj: { reportId, archiveId: archive.id, category },
    });

    res.status(201).json({ id: reportId, status: 'OPEN' });
  });
}
