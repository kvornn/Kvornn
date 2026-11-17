import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  AccessKeyType,
  AccountStatus,
  AdminProfile,
  CustomRoleBadgeDTO,
  Language,
  UserRank,
} from '../shared/types';
import { hasAdminCapability } from '../shared/permissions';
import { recordSecurityEvent } from './db';

export interface AuthenticatedUser {
  id: string;
  username: string;
  avatarUrl: string;
  rank: UserRank;
  adminProfile: AdminProfile | null;
  keyType: AccessKeyType;
  customRoles: CustomRoleBadgeDTO[];
  status: AccountStatus;
  preferredLang: Language;
  mfaEnabled: boolean;
  sessionId: string;
}

export interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
}

export const SESSION_COOKIE_NAME = 'sentarika_sid';
export const CSRF_COOKIE_NAME = 'sentarika_csrf';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  return (req.socket?.remoteAddress || '127.0.0.1').slice(0, 64);
}

export function setAuthCookies(
  req: Request,
  res: Response,
  rawSessionToken: string,
  csrfToken: string
): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, rawSessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isSecure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
}

export function getUserCustomRoles(db: DatabaseSync, userId: string): CustomRoleBadgeDTO[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.display_name_tr, r.display_name_en, r.color
       FROM user_custom_roles ucr
       JOIN roles r ON r.id = ucr.role_id
       WHERE ucr.user_id = ?
       ORDER BY r.hierarchy_order ASC, r.display_name_en ASC`
    )
    .all(userId) as Array<{
    id: string;
    display_name_tr: string;
    display_name_en: string;
    color: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    displayNameTr: r.display_name_tr,
    displayNameEn: r.display_name_en,
    color: r.color,
  }));
}

export function createSession(
  db: DatabaseSync,
  userId: string,
  req: Request,
  sessionSecret: string
): { rawToken: string; csrfToken: string; sessionId: string } {
  // Revoke any pre-existing session cookie token (session fixation protection)
  const existingCookie = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof existingCookie === 'string' && existingCookie) {
    const oldHash = hashSessionToken(existingCookie, sessionSecret);
    db.prepare(`UPDATE user_sessions SET revoked = 1 WHERE token_hash = ?`).run(oldHash);
  }

  const sessionId = crypto.randomUUID();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken, sessionSecret);
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, revoked, expires_at, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    sessionId,
    userId,
    tokenHash,
    getClientIp(req),
    (req.headers['user-agent'] || 'Unknown').slice(0, 200),
    expiresAt,
    now.toISOString(),
    now.toISOString()
  );

  db.prepare(`UPDATE users SET last_active_at = ? WHERE id = ?`).run(now.toISOString(), userId);

  return { rawToken, csrfToken, sessionId };
}

export function loadUserFromSession(
  db: DatabaseSync,
  rawToken: string | undefined,
  sessionSecret: string
): { user: AuthenticatedUser | null; banDetails?: { status: AccountStatus; reason: string; expiresAt: string | null } } {
  if (!rawToken) return { user: null };
  const tokenHash = hashSessionToken(rawToken, sessionSecret);

  const row = db
    .prepare(
      `SELECT s.id as session_id, s.revoked, s.expires_at,
              u.id, u.username, u.key_hash, u.key_type, u.avatar_url, u.rank, u.status, u.mfa_enabled,
              ar.profile as admin_profile,
              COALESCE(up.preferred_lang, 'tr') as preferred_lang
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN admin_roles ar ON ar.user_id = u.id
       LEFT JOIN user_preferences up ON up.user_id = u.id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        session_id: string;
        revoked: number;
        expires_at: string;
        id: string;
        username: string;
        key_hash: string | null;
        key_type: AccessKeyType;
        avatar_url: string;
        rank: UserRank;
        status: AccountStatus;
        mfa_enabled: number;
        admin_profile: AdminProfile | null;
        preferred_lang: Language;
      }
    | undefined;

  if (!row || row.revoked === 1 || !row.key_hash) return { user: null };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`UPDATE user_sessions SET revoked = 1 WHERE id = ?`).run(row.session_id);
    return { user: null };
  }

  let currentStatus = row.status;
  if (currentStatus === 'BANNED_TEMP') {
    const activeBan = db
      .prepare(
        `SELECT id, reason, expires_at FROM bans WHERE user_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`
      )
      .get(row.id) as { id: string; reason: string; expires_at: string | null } | undefined;

    if (activeBan?.expires_at && new Date(activeBan.expires_at).getTime() <= Date.now()) {
      db.prepare(`UPDATE bans SET active = 0, lifted_reason = 'Temporary ban expired', lifted_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        activeBan.id
      );
      db.prepare(`UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        row.id
      );
      currentStatus = 'ACTIVE';
    } else if (activeBan) {
      return {
        user: null,
        banDetails: {
          status: currentStatus,
          reason: activeBan.reason,
          expiresAt: activeBan.expires_at,
        },
      };
    }
  } else if (currentStatus === 'BANNED_PERM' || currentStatus === 'SUSPENDED') {
    const activeBan = db
      .prepare(
        `SELECT reason, expires_at FROM bans WHERE user_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`
      )
      .get(row.id) as { reason: string; expires_at: string | null } | undefined;
    return {
      user: null,
      banDetails: {
        status: currentStatus,
        reason: activeBan?.reason || 'Account frozen or suspended by security administration.',
        expiresAt: activeBan?.expires_at || null,
      },
    };
  }

  const nowIso = new Date().toISOString();
  db.prepare(`UPDATE user_sessions SET last_seen_at = ? WHERE id = ?`).run(nowIso, row.session_id);
  db.prepare(`UPDATE users SET last_active_at = ? WHERE id = ?`).run(nowIso, row.id);

  const customRoles = getUserCustomRoles(db, row.id);

  return {
    user: {
      id: row.id,
      username: row.username,
      avatarUrl: row.avatar_url,
      rank: row.rank,
      adminProfile: row.admin_profile,
      keyType: row.key_type || 'MEMBER',
      customRoles,
      status: currentStatus,
      preferredLang: row.preferred_lang === 'en' ? 'en' : 'tr',
      mfaEnabled: row.mfa_enabled === 1,
      sessionId: row.session_id,
    },
  };
}

export function attachAuthMiddleware(db: DatabaseSync, sessionSecret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    const { user, banDetails } = loadUserFromSession(db, rawToken, sessionSecret);
    if (banDetails) {
      clearAuthCookies(res);
      (req as AuthedRequest & { banDetails?: typeof banDetails }).banDetails = banDetails;
    }
    if (user) {
      req.authUser = user;
    }
    next();
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const banDetails = (req as AuthedRequest & { banDetails?: { status: AccountStatus; reason: string; expiresAt: string | null } }).banDetails;
  if (banDetails) {
    return res.status(403).json({
      error: 'Account suspended or banned',
      code: 'ACCOUNT_BANNED',
      ban: banDetails,
    });
  }
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  }
  next();
}

export function requireCsrf(req: AuthedRequest, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  const hasSessionCookie = Boolean(req.cookies?.[SESSION_COOKIE_NAME]);
  if (!hasSessionCookie) {
    return next();
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];
  if (
    !cookieToken ||
    typeof headerToken !== 'string' ||
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token', code: 'CSRF_FAILED' });
  }
  next();
}

export function requireAdminCapability(capability: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    }
    if (
      req.authUser.keyType !== 'ADMIN' ||
      !hasAdminCapability(req.authUser.rank, req.authUser.adminProfile, capability)
    ) {
      return res.status(403).json({ error: 'Insufficient administrative privileges', code: 'FORBIDDEN' });
    }
    next();
  };
}

// Sliding window rate limiter
export class SlidingRateLimiter {
  private buckets = new Map<string, number[]>();

  constructor(private windowMs: number, private maxHits: number) {}

  consume(key: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const hits = (this.buckets.get(key) || []).filter((ts) => ts > cutoff);
    if (hits.length >= this.maxHits) {
      const oldest = hits[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, hits);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    hits.push(now);
    this.buckets.set(key, hits);
    return { allowed: true, remaining: this.maxHits - hits.length, retryAfterSeconds: 0 };
  }
}

export function rateLimitMiddleware(
  limiter: SlidingRateLimiter,
  db: DatabaseSync,
  label: string
) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const key = `${label}:${ip}:${req.authUser?.id || 'anon'}`;
    const result = limiter.consume(key);
    if (!result.allowed) {
      recordSecurityEvent(db, {
        eventType: 'RATE_LIMIT_TRIGGERED',
        severity: 'WARN',
        userId: req.authUser?.id || null,
        ipAddress: ip,
        details: `Rate limit exceeded on ${label}`,
      });
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    next();
  };
}

// Cryptographic CAPTCHA & Cloudflare Turnstile verification
export interface CaptchaChallenge {
  challengeId: string;
  promptTr: string;
  promptEn: string;
  a: number;
  b: number;
  expiresAt: number;
  signature: string;
  turnstileSiteKey: string | null;
}

export function issueCaptchaChallenge(secret: string): CaptchaChallenge {
  const a = crypto.randomInt(2, 19);
  const b = crypto.randomInt(2, 19);
  const challengeId = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const payload = `${challengeId}:${a + b}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return {
    challengeId,
    promptTr: `${a} + ${b} işleminin sonucu nedir?`,
    promptEn: `What is ${a} + ${b}?`,
    a,
    b,
    expiresAt,
    signature,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
  };
}

const usedChallengeIds = new Set<string>();

export async function verifyCaptchaSubmission(
  input: {
    challengeId?: string;
    answer?: string | number;
    expiresAt?: number;
    signature?: string;
    turnstileToken?: string;
  },
  secret: string,
  remoteIp: string
): Promise<boolean> {
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret && input.turnstileToken) {
    try {
      const form = new URLSearchParams();
      form.append('secret', turnstileSecret);
      form.append('response', input.turnstileToken);
      form.append('remoteip', remoteIp);
      const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
      });
      const data = (await resp.json()) as { success?: boolean };
      return Boolean(data.success);
    } catch {
      return false;
    }
  }

  if (!input.challengeId || !input.signature || !input.expiresAt || input.answer === undefined) {
    return false;
  }
  if (Date.now() > Number(input.expiresAt)) return false;
  if (usedChallengeIds.has(input.challengeId)) return false;

  const numericAnswer = Number(String(input.answer).trim());
  if (!Number.isFinite(numericAnswer)) return false;

  const payload = `${input.challengeId}:${numericAnswer}:${input.expiresAt}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== input.signature.length) return false;

  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  if (ok) {
    usedChallengeIds.add(input.challengeId);
    if (usedChallengeIds.size > 5000) {
      const first = usedChallengeIds.values().next().value;
      if (first) usedChallengeIds.delete(first);
    }
  }
  return ok;
}
