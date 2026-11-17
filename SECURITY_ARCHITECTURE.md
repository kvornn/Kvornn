# Sentarika Archive — Security & Production Integration Architecture

## 1. Zero-Trust Key-Only Backend Controls Implemented
- **Key-Only Authentication & CSPRNG Provisioning**: Email addresses, passwords, OAuth logins, and account recovery endpoints are completely absent. Every account authenticates solely via a **30-character high-entropy Access Key** generated on the backend using `node:crypto` CSPRNG (`randomBytes` with unbiased rejection sampling over an unambiguous Crockford-style Base32 alphabet — zero `Math.random()`).
- **Cryptographic Key Storage & Zero-Recovery**: Plaintext Access Keys are displayed **once only** during registration (`/api/auth/register/generate` -> confirmed via `/api/auth/register/complete`) and never logged or stored in plaintext. Only `HMAC-SHA256(normalizedKey, ACCESS_KEY_PEPPER)` (`key_hash`) is persisted in SQLite (`users.key_hash`). Collision checks run across `users` and `pending_registrations` inside `BEGIN IMMEDIATE` transactions.
- **Sessions & CSRF**: Sessions use opaque 256-bit tokens hashed with HMAC-SHA256 in `user_sessions`, delivered via `HttpOnly`, `SameSite=Lax` (`Secure` behind HTTPS/proxy) cookies (`sentarika_sid`). State-changing `/api/*` requests enforce double-submit CSRF validation (`sentarika_csrf` paired with `X-CSRF-Token` using `crypto.timingSafeEqual`).
- **TOTP MFA**: RFC 6238 SHA-1 6-digit TOTP verification bound to the member's `username` via `otpauth` + QR provisioning.
- **7-Tier Authorization Precedence (Ranks + Custom Roles + Subcategories)**:
  1. Account status (`ACTIVE` required; `BANNED_TEMP`, `BANNED_PERM`, and `SUSPENDED` accounts are rejected immediately and active sessions revoked).
  2. Admin security profiles (`PRIMARY_ADMIN`, `ARCHIVE_ADMIN`, `SECURITY_ADMIN`, requiring `key_type = 'ADMIN'`).
  3. User-specific explicit overrides (`ARCHIVE` -> `CATEGORY` -> `GLOBAL`, where explicit `DENY` holds).
  4. Archive-level role & rank rules (`archive_permissions`).
  5. Subcategory-level role & rank rules (`category_permissions` for `subcategory_id`, overriding parent category when set).
  6. Parent category-level role & rank rules (`category_permissions` for `category_id`).
  7. Global Role & Rank Permission Matrix (`role_permissions`) across the user's rank (`UYE`, `DESTEKCI`, `ISLETME`) plus all assigned Discord-style custom roles (`user_custom_roles`). Conflict rule: explicit `DENY` always beats `ALLOW`; absence of `ALLOW` defaults to **Deny**.
- **Private File Storage, Malware Scan Hook & Signed Downloads**: Uploaded files stream to `storage/tmp_uploads/` (`multer`), pass extension allowlisting, active-content blocking (`.html`, `.svg`, `.js`, `.php`, `.exe`, compound extensions), MIME matching, binary magic-byte inspection (`%PDF`, PNG, JPEG), and `runMalwareScanHook()` (active-signature + optional ClamAV `clamd` hook) before promotion to `storage/private_files/`. Downloads require `POST /api/files/:id/sign-url` + `GET /api/files/download/:id?exp=...&sig=...` with user-bound HMAC verification and live permission re-evaluation.
- **Content Moderation & Immutable Audit Chain**: Members can report accessible archives via `POST /api/reports`; authorized admins triage via `/api/admin/reports` (`DISMISS`, `HIDE_ARCHIVE`, `DELETE_ARCHIVE`) with mandatory audit justification. `audit_logs` maintains a SHA-256 `prev_hash -> entry_hash` ledger protected by SQLite `BEFORE UPDATE` / `BEFORE DELETE` abort triggers.
- **Non-Destructive Upgrade & Automatic Backups**: Migrating an existing pre-v2 database automatically creates a SQLite `VACUUM INTO` snapshot under `storage/backups/pre_v2_migration_*.db` before transforming schema tables. Primary Admins can also trigger on-demand snapshots via `POST /api/admin/backup`.

## 2. Production Operator Checklist & Edge Integration
1. **Required Secrets**:
   - Configure strong 32+ byte random values for `SESSION_SECRET` and `ACCESS_KEY_PEPPER` in runtime secrets (never commit secrets or change `ACCESS_KEY_PEPPER` without re-provisioning keys, as hashes depend on it).
2. **Initial Bootstrapped Founder Admin Keys**:
   - Three founder administrator accounts (`PRIMARY_ADMIN`, `ARCHIVE_ADMIN`, `SECURITY_ADMIN`) are bootstrapped automatically on clean start or v1->v2 migration when `key_hash IS NULL`.
   - When generated, their one-time plaintext 30-character Access Keys are written strictly to `storage/BOOTSTRAP_ADMIN_KEYS.txt` (`0600`). Copy them into an offline hardware/password vault, verify sign-in + enable TOTP MFA on all three accounts, and **shred/delete `storage/BOOTSTRAP_ADMIN_KEYS.txt`** immediately.
3. **Cloudflare WAF, Turnstile & ClamAV**:
   - Configure `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` for Cloudflare Turnstile verification in `verifyCaptchaSubmission()`.
   - Configure `CLAMAV_SCAN_HOST` to enable external daemon binary scanning inside `runMalwareScanHook()`.
