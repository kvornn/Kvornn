import crypto from 'node:crypto';
import type { Express, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { TOTP } from 'otpauth';
import {
  AuthedRequest,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SlidingRateLimiter,
  clearAuthCookies,
  createSession,
  getClientIp,
  getUserCustomRoles,
  issueCaptchaChallenge,
  rateLimitMiddleware,
  requireAuth,
  setAuthCookies,
  verifyCaptchaSubmission,
} from '../auth';
import {
  ServerSecrets,
  appendAuditLog,
  recordSecurityEvent,
} from '../db';
import {
  generateAccessKey,
  hashAccessKey,
  hashAuditIdentifier,
  isValidAccessKeyFormat,
  normalizeAccessKey,
  timingSafeHexEquals,
} from '../../shared/security';
import { AccessKeyType, AccountStatus, AdminProfile, Language, UserRank } from '../../shared/types';

function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(username);
}

export function registerAuthRoutes(
  app: Express,
  db: DatabaseSync,
  secrets: ServerSecrets,
  options?: { loginRateMax?: number }
) {
  const loginLimiter = new SlidingRateLimiter(60_000, options?.loginRateMax ?? 8);
  const registerLimiter = new SlidingRateLimiter(60_000, 12);

  app.get('/api/auth/challenge', (_req, res) => {
    const challenge = issueCaptchaChallenge(secrets.sessionSecret);
    res.json(challenge);
  });

  app.get('/api/auth/me', (req: AuthedRequest, res: Response) => {
    const banDetails = (
      req as AuthedRequest & {
        banDetails?: { status: AccountStatus; reason: string; expiresAt: string | null };
      }
    ).banDetails;

    if (banDetails) {
      return res.status(403).json({
        authenticated: false,
        code: 'ACCOUNT_BANNED',
        ban: banDetails,
      });
    }

    if (!req.authUser) {
      return res.json({ authenticated: false, user: null });
    }

    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      const csrf = crypto.randomBytes(24).toString('hex');
      res.cookie(CSRF_COOKIE_NAME, csrf, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
      });
    }

    return res.json({ authenticated: true, user: req.authUser });
  });

  // Step 1: Validate username + CAPTCHA, generate unique CSPRNG 30-char access key once only
  app.post(
    '/api/auth/register/generate',
    rateLimitMiddleware(registerLimiter, db, 'register_generate'),
    async (req: AuthedRequest, res: Response) => {
      const ip = getClientIp(req);
      try {
        const { username, preferredLang, captcha } = req.body || {};

        const captchaOk = await verifyCaptchaSubmission(captcha || {}, secrets.sessionSecret, ip);
        if (!captchaOk) {
          recordSecurityEvent(db, {
            eventType: 'CAPTCHA_FAILED',
            severity: 'WARN',
            ipAddress: ip,
            details: 'Registration key generation blocked by failed CAPTCHA verification',
          });
          return res.status(400).json({ error: 'Invalid CAPTCHA verification', code: 'CAPTCHA_INVALID' });
        }

        const cleanUsername = String(username || '').trim();
        if (!validateUsername(cleanUsername)) {
          return res.status(400).json({
            error: 'Username must be 3-32 characters (letters, numbers, _, ., -)',
            code: 'INVALID_USERNAME',
          });
        }
        const normalizedUsername = cleanUsername.toLowerCase();
        const lang: Language = preferredLang === 'en' ? 'en' : 'tr';
        const nowIso = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        let registrationToken = '';
        let plaintextKey = '';
        let txConflict: { status: number; code: string; message: string } | null = null;

        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(`DELETE FROM pending_registrations WHERE expires_at <= ?`).run(nowIso);

          const existingUser = db
            .prepare(`SELECT id FROM users WHERE username_normalized = ?`)
            .get(normalizedUsername) as { id: string } | undefined;

          const existingPending = db
            .prepare(`SELECT token FROM pending_registrations WHERE username_normalized = ?`)
            .get(normalizedUsername) as { token: string } | undefined;

          if (existingUser || existingPending) {
            txConflict = {
              status: 409,
              code: 'USERNAME_TAKEN',
              message: 'Username is already registered or reserved',
            };
            db.exec('ROLLBACK');
          } else {
            let keyHash = '';
            for (let attempt = 0; attempt < 5; attempt++) {
              const candidate = generateAccessKey();
              const candidateHash = hashAccessKey(candidate, secrets.keyPepper);
              const clashUser = db.prepare(`SELECT id FROM users WHERE key_hash = ?`).get(candidateHash);
              const clashPending = db
                .prepare(`SELECT token FROM pending_registrations WHERE key_hash = ?`)
                .get(candidateHash);
              if (!clashUser && !clashPending) {
                plaintextKey = candidate;
                keyHash = candidateHash;
                break;
              }
            }

            if (!plaintextKey || !keyHash) {
              throw new Error('Failed to generate collision-free access key');
            }

            registrationToken = crypto.randomBytes(24).toString('hex');
            db.prepare(
              `INSERT INTO pending_registrations (token, username, username_normalized, key_hash, preferred_lang, expires_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(
              registrationToken,
              cleanUsername,
              normalizedUsername,
              keyHash,
              lang,
              expiresAt,
              nowIso
            );
            db.exec('COMMIT');
          }
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // ignore
          }
          throw err;
        }

        if (txConflict) {
          return res.status(txConflict.status).json({ error: txConflict.message, code: txConflict.code });
        }

        // Key is returned ONLY here in this response and NEVER persisted in plaintext or logs
        return res.status(201).json({
          registrationToken,
          accessKey: plaintextKey,
          username: cleanUsername,
          expiresAt,
        });
      } catch (error) {
        console.error('Register generate error:', error);
        return res.status(500).json({ error: 'Key generation failed', code: 'SERVER_ERROR' });
      }
    }
  );

  // Step 2: Confirm user saved their access key and finalize member registration (strictly rank UYE)
  app.post(
    '/api/auth/register/complete',
    rateLimitMiddleware(registerLimiter, db, 'register_complete'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const { registrationToken, acknowledgedNoRecovery } = req.body || {};

        if (acknowledgedNoRecovery !== true) {
          return res.status(400).json({
            error: 'You must confirm that you have safely stored your access key and understand there is no recovery.',
            code: 'ACKNOWLEDGEMENT_REQUIRED',
          });
        }

        const cleanToken = String(registrationToken || '').trim();
        if (!cleanToken) {
          return res.status(400).json({
            error: 'Missing registration token',
            code: 'INVALID_REGISTRATION_TOKEN',
          });
        }

        const nowIso = new Date().toISOString();
        const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        let createdUser: { username: string; preferredLang: Language } | null = null;
        let txError: { status: number; code: string; message: string } | null = null;

        db.exec('BEGIN IMMEDIATE');
        try {
          const pending = db
            .prepare(
              `SELECT token, username, username_normalized, key_hash, preferred_lang, expires_at
               FROM pending_registrations WHERE token = ?`
            )
            .get(cleanToken) as
            | {
                token: string;
                username: string;
                username_normalized: string;
                key_hash: string;
                preferred_lang: Language;
                expires_at: string;
              }
            | undefined;

          if (!pending) {
            txError = {
              status: 400,
              code: 'REGISTRATION_NOT_FOUND',
              message: 'Registration session expired or already completed',
            };
            db.exec('ROLLBACK');
          } else if (new Date(pending.expires_at).getTime() <= Date.now()) {
            db.prepare(`DELETE FROM pending_registrations WHERE token = ?`).run(cleanToken);
            txError = {
              status: 400,
              code: 'REGISTRATION_EXPIRED',
              message: 'Registration session expired; please generate a new key',
            };
            db.exec('COMMIT');
          } else {
            const clash = db
              .prepare(`SELECT id FROM users WHERE username_normalized = ? OR key_hash = ?`)
              .get(pending.username_normalized, pending.key_hash);
            if (clash) {
              db.prepare(`DELETE FROM pending_registrations WHERE token = ?`).run(cleanToken);
              txError = {
                status: 409,
                code: 'USERNAME_TAKEN',
                message: 'Username or key already registered',
              };
              db.exec('COMMIT');
            } else {
              // Strictly force rank = 'UYE' and key_type = 'MEMBER'
              db.prepare(
                `INSERT INTO users (id, username, username_normalized, key_hash, key_type, avatar_url, rank, status, mfa_enabled, last_active_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'MEMBER', '', 'UYE', 'ACTIVE', 0, ?, ?, ?)`
              ).run(userId, pending.username, pending.username_normalized, pending.key_hash, nowIso, nowIso, nowIso);

              db.prepare(
                `INSERT INTO user_preferences (user_id, preferred_lang, updated_at) VALUES (?, ?, ?)`
              ).run(userId, pending.preferred_lang === 'en' ? 'en' : 'tr', nowIso);

              db.prepare(`DELETE FROM pending_registrations WHERE token = ?`).run(cleanToken);

              appendAuditLog(db, {
                actorId: userId,
                actorUsername: pending.username,
                action: 'USER_REGISTER',
                targetType: 'user',
                targetId: userId,
                summary: `Registered member ${pending.username} with rank UYE via key-only onboarding`,
                afterObj: { rank: 'UYE', keyType: 'MEMBER' },
              });

              createdUser = {
                username: pending.username,
                preferredLang: pending.preferred_lang === 'en' ? 'en' : 'tr',
              };
              db.exec('COMMIT');
            }
          }
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // ignore
          }
          throw err;
        }

        if (txError) {
          return res.status(txError.status).json({ error: txError.message, code: txError.code });
        }
        if (!createdUser) {
          return res.status(400).json({ error: 'Registration failed', code: 'REGISTRATION_FAILED' });
        }

        const session = createSession(db, userId, req, secrets.sessionSecret);
        setAuthCookies(req, res, session.rawToken, session.csrfToken);

        return res.status(201).json({
          user: {
            id: userId,
            username: createdUser.username,
            avatarUrl: '',
            rank: 'UYE',
            adminProfile: null,
            keyType: 'MEMBER',
            customRoles: [],
            status: 'ACTIVE',
            preferredLang: createdUser.preferredLang,
            mfaEnabled: false,
            sessionId: session.sessionId,
          },
        });
      } catch (error) {
        console.error('Register complete error:', error);
        return res.status(500).json({ error: 'Registration completion failed', code: 'SERVER_ERROR' });
      }
    }
  );

  // Key-Only Login (ONLY 30-character access key + CAPTCHA + optional TOTP MFA)
  app.post(
    '/api/auth/login',
    rateLimitMiddleware(loginLimiter, db, 'login'),
    async (req: AuthedRequest, res: Response) => {
      const ip = getClientIp(req);
      try {
        const { accessKey, mfaCode, captcha } = req.body || {};

        const captchaOk = await verifyCaptchaSubmission(captcha || {}, secrets.sessionSecret, ip);
        if (!captchaOk) {
          recordSecurityEvent(db, {
            eventType: 'CAPTCHA_FAILED',
            severity: 'WARN',
            ipAddress: ip,
            details: 'Login blocked by failed CAPTCHA verification',
          });
          return res.status(400).json({ error: 'Invalid CAPTCHA verification', code: 'CAPTCHA_INVALID' });
        }

        const cleanKey = normalizeAccessKey(String(accessKey || ''));
        const attemptId = crypto.randomUUID();
        const now = new Date().toISOString();

        if (!isValidAccessKeyFormat(cleanKey)) {
          const idHash = hashAuditIdentifier(`invalid-format:${ip}`, secrets.keyPepper);
          db.prepare(
            `INSERT INTO login_attempts (id, identifier_hash, ip_address, success, failure_reason, created_at)
             VALUES (?, ?, ?, 0, 'INVALID_KEY', ?)`
          ).run(attemptId, idHash, ip, now);

          recordSecurityEvent(db, {
            eventType: 'LOGIN_FAILED',
            severity: 'WARN',
            ipAddress: ip,
            details: 'Failed key login attempt (invalid key format)',
          });

          return res.status(401).json({
            error: 'Invalid access key',
            code: 'INVALID_ACCESS_KEY',
          });
        }

        const keyHash = hashAccessKey(cleanKey, secrets.keyPepper);
        const userRow = db
          .prepare(
            `SELECT u.id, u.username, u.key_hash, u.key_type, u.avatar_url, u.rank, u.status, u.mfa_enabled, u.mfa_secret,
                    ar.profile as admin_profile,
                    COALESCE(up.preferred_lang, 'tr') as preferred_lang
             FROM users u
             LEFT JOIN admin_roles ar ON ar.user_id = u.id
             LEFT JOIN user_preferences up ON up.user_id = u.id
             WHERE u.key_hash = ?`
          )
          .get(keyHash) as
          | {
              id: string;
              username: string;
              key_hash: string | null;
              key_type: AccessKeyType;
              avatar_url: string;
              rank: UserRank;
              status: AccountStatus;
              mfa_enabled: number;
              mfa_secret: string | null;
              admin_profile: AdminProfile | null;
              preferred_lang: Language;
            }
          | undefined;

        if (!userRow || !userRow.key_hash || !timingSafeHexEquals(keyHash, userRow.key_hash)) {
          const idHash = hashAuditIdentifier(keyHash.slice(0, 16), secrets.keyPepper);
          db.prepare(
            `INSERT INTO login_attempts (id, identifier_hash, ip_address, success, failure_reason, created_at)
             VALUES (?, ?, ?, 0, 'INVALID_KEY', ?)`
          ).run(attemptId, idHash, ip, now);

          recordSecurityEvent(db, {
            eventType: 'LOGIN_FAILED',
            severity: 'WARN',
            ipAddress: ip,
            details: 'Failed key login attempt (unrecognized key)',
          });

          return res.status(401).json({
            error: 'Invalid access key',
            code: 'INVALID_ACCESS_KEY',
          });
        }

        let currentStatus = userRow.status;
        if (currentStatus === 'BANNED_TEMP' || currentStatus === 'BANNED_PERM' || currentStatus === 'SUSPENDED') {
          const activeBan = db
            .prepare(`SELECT id, reason, expires_at FROM bans WHERE user_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`)
            .get(userRow.id) as { id: string; reason: string; expires_at: string | null } | undefined;

          if (
            currentStatus === 'BANNED_TEMP' &&
            activeBan?.expires_at &&
            new Date(activeBan.expires_at).getTime() <= Date.now()
          ) {
            db.prepare(`UPDATE bans SET active = 0, lifted_reason = 'Temporary ban expired', lifted_at = ? WHERE id = ?`).run(
              now,
              activeBan.id
            );
            db.prepare(`UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?`).run(now, userRow.id);
            currentStatus = 'ACTIVE';
          } else {
            return res.status(403).json({
              error: 'Account suspended or banned',
              code: 'ACCOUNT_BANNED',
              ban: {
                status: currentStatus,
                reason: activeBan?.reason || 'Account suspended by administration.',
                expiresAt: activeBan?.expires_at || null,
              },
            });
          }
        }

        if (userRow.mfa_enabled === 1 && userRow.mfa_secret) {
          if (!mfaCode) {
            return res.status(200).json({ mfaRequired: true });
          }
          const totp = new TOTP({
            issuer: 'Sentarika Archive',
            label: userRow.username,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: userRow.mfa_secret,
          });
          const delta = totp.validate({ token: String(mfaCode).trim(), window: 1 });
          if (delta === null) {
            recordSecurityEvent(db, {
              eventType: 'MFA_FAILED',
              severity: 'HIGH',
              userId: userRow.id,
              ipAddress: ip,
              details: 'Invalid MFA token on key login',
            });
            return res.status(401).json({ error: 'Invalid MFA verification code', code: 'MFA_INVALID' });
          }
        }

        const successIdHash = hashAuditIdentifier(userRow.id, secrets.keyPepper);
        db.prepare(
          `INSERT INTO login_attempts (id, identifier_hash, ip_address, success, failure_reason, created_at)
           VALUES (?, ?, ?, 1, NULL, ?)`
        ).run(attemptId, successIdHash, ip, now);

        const session = createSession(db, userRow.id, req, secrets.sessionSecret);
        setAuthCookies(req, res, session.rawToken, session.csrfToken);
        const customRoles = getUserCustomRoles(db, userRow.id);

        return res.json({
          mfaRequired: false,
          user: {
            id: userRow.id,
            username: userRow.username,
            avatarUrl: userRow.avatar_url,
            rank: userRow.rank,
            adminProfile: userRow.admin_profile,
            keyType: userRow.key_type || 'MEMBER',
            customRoles,
            status: currentStatus,
            preferredLang: userRow.preferred_lang === 'en' ? 'en' : 'tr',
            mfaEnabled: userRow.mfa_enabled === 1,
            sessionId: session.sessionId,
          },
        });
      } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed', code: 'SERVER_ERROR' });
      }
    }
  );

  app.post('/api/auth/logout', (req: AuthedRequest, res: Response) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (req.authUser && rawToken) {
      db.prepare(`UPDATE user_sessions SET revoked = 1 WHERE id = ?`).run(req.authUser.sessionId);
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  app.patch('/api/auth/preferences', requireAuth, (req: AuthedRequest, res: Response) => {
    const lang: Language = req.body?.preferredLang === 'en' ? 'en' : 'tr';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO user_preferences (user_id, preferred_lang, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET preferred_lang = excluded.preferred_lang, updated_at = excluded.updated_at`
    ).run(req.authUser!.id, lang, now);
    res.json({ preferredLang: lang });
  });
}
