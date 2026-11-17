import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ALL_PERMISSIONS,
  AdminProfile,
  PermissionKey,
  UserRank,
} from '../shared/types';
import {
  computeAuditHash,
  generateAccessKey,
  hashAccessKey,
  isValidAccessKeyFormat,
  normalizeAccessKey,
} from '../shared/security';

export interface ServerSecrets {
  sessionSecret: string;
  keyPepper: string;
}

export interface BootstrapAdminSpec {
  profile: AdminProfile;
  username: string;
  envKeyName: string;
}

export const BOOTSTRAP_ADMIN_SPEC: BootstrapAdminSpec = {
  profile: 'ADMIN',
  username: 'sentarika_admin',
  envKeyName: 'BOOTSTRAP_ADMIN_KEY',
};

export function initDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  runMigrations(db, dbPath);
  return db;
}

function getColumnNames(db: DatabaseSync, tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tableName) as { name: string } | undefined;
  return Boolean(row);
}

export function createDatabaseBackup(db: DatabaseSync, backupDir: string, prefix = 'sentarika_backup'): string {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `${prefix}_${stamp}_${crypto.randomBytes(3).toString('hex')}.db`);
  const escaped = dest.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}';`);
  return dest;
}

function runMigrations(db: DatabaseSync, dbPath: string) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare(`SELECT version FROM schema_migrations`).all() as Array<{ version: number }>).map(
      (r) => r.version
    )
  );

  const hasLegacyUsers = tableExists(db, 'users') && getColumnNames(db, 'users').has('email');
  if (hasLegacyUsers && !applied.has(2) && dbPath !== ':memory:') {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    createDatabaseBackup(db, backupDir, 'pre_v2_migration');
  }

  // Migration 1: Fresh v3-compatible schema on clean boot
  if (!applied.has(1) && !tableExists(db, 'users')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        display_name_tr TEXT NOT NULL,
        display_name_en TEXT NOT NULL,
        hierarchy_order INTEGER NOT NULL,
        is_admin_role INTEGER NOT NULL DEFAULT 0,
        is_system_rank INTEGER NOT NULL DEFAULT 1,
        color TEXT NOT NULL DEFAULT '#B89B63',
        description_tr TEXT NOT NULL DEFAULT '',
        description_en TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS permissions (
        key TEXT PRIMARY KEY,
        group_name TEXT NOT NULL,
        label_tr TEXT NOT NULL,
        label_en TEXT NOT NULL,
        description_tr TEXT NOT NULL,
        description_en TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
        allowed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (role_id, permission_key)
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        username_normalized TEXT NOT NULL UNIQUE,
        key_hash TEXT UNIQUE,
        key_type TEXT NOT NULL DEFAULT 'MEMBER',
        avatar_url TEXT NOT NULL DEFAULT '',
        rank TEXT NOT NULL DEFAULT 'UYE' REFERENCES roles(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        mfa_enabled INTEGER NOT NULL DEFAULT 0,
        mfa_secret TEXT,
        last_active_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_custom_roles (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS pending_registrations (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        key_hash TEXT NOT NULL UNIQUE,
        preferred_lang TEXT NOT NULL DEFAULT 'tr',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_roles (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        profile TEXT NOT NULL UNIQUE,
        granted_by TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        preferred_lang TEXT NOT NULL DEFAULT 'tr',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        code_prefix TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        note TEXT NOT NULL DEFAULT '',
        expires_at TEXT,
        used_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name_tr TEXT NOT NULL,
        name_en TEXT NOT NULL,
        description_tr TEXT NOT NULL DEFAULT '',
        description_en TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'Archive',
        cover_image_url TEXT NOT NULL DEFAULT '',
        accent_color TEXT NOT NULL DEFAULT '#B89B63',
        parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        visibility TEXT NOT NULL DEFAULT 'PUBLIC',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS category_permissions (
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        effect TEXT NOT NULL DEFAULT 'INHERIT',
        PRIMARY KEY (category_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS archives (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        subcategory_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        title_tr TEXT NOT NULL,
        title_en TEXT NOT NULL,
        short_desc_tr TEXT NOT NULL DEFAULT '',
        short_desc_en TEXT NOT NULL DEFAULT '',
        long_desc_tr TEXT NOT NULL DEFAULT '',
        long_desc_en TEXT NOT NULL DEFAULT '',
        source_info TEXT NOT NULL DEFAULT '',
        cover_image_url TEXT NOT NULL DEFAULT '',
        access_level TEXT NOT NULL DEFAULT 'STANDARD',
        search_visible INTEGER NOT NULL DEFAULT 1,
        is_featured INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        published_at TEXT,
        view_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS archive_permissions (
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        effect TEXT NOT NULL DEFAULT 'INHERIT',
        PRIMARY KEY (archive_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS archive_files (
        id TEXT PRIMARY KEY,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        download_permission TEXT NOT NULL DEFAULT 'INHERIT',
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        scan_status TEXT NOT NULL DEFAULT 'CLEAN',
        download_count INTEGER NOT NULL DEFAULT 0,
        uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS archive_tags (
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (archive_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS favorites (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, archive_id)
      );

      CREATE TABLE IF NOT EXISTS recently_viewed (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        viewed_at TEXT NOT NULL,
        PRIMARY KEY (user_id, archive_id)
      );

      CREATE TABLE IF NOT EXISTS user_permission_overrides (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        target_id TEXT,
        permission_key TEXT REFERENCES permissions(key) ON DELETE CASCADE,
        effect TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ban_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        issued_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        expires_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        lifted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        lifted_reason TEXT,
        lifted_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS content_reports (
        id TEXT PRIMARY KEY,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        action_taken TEXT,
        resolution_note TEXT,
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT,
        actor_username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        summary TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        prev_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        user_id TEXT,
        ip_address TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        id TEXT PRIMARY KEY,
        identifier_hash TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        success INTEGER NOT NULL,
        failure_reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS translations (
        key TEXT NOT NULL,
        lang TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (key, lang)
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`).run(
      1,
      'initial_schema',
      now
    );
    db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`).run(
      2,
      'key_auth_custom_roles_reports',
      now
    );
    db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`).run(
      3,
      'unified_admin_and_extended_archive_schema',
      now
    );
  } else if (!applied.has(2)) {
    // Non-destructive upgrade from legacy v1 database -> v2 database
    const now = new Date().toISOString();
    const roleCols = getColumnNames(db, 'roles');
    if (!roleCols.has('is_system_rank')) {
      db.exec(`ALTER TABLE roles ADD COLUMN is_system_rank INTEGER NOT NULL DEFAULT 1;`);
    }
    if (!roleCols.has('color')) {
      db.exec(`ALTER TABLE roles ADD COLUMN color TEXT NOT NULL DEFAULT '#B89B63';`);
    }
    if (!roleCols.has('description_tr')) {
      db.exec(`ALTER TABLE roles ADD COLUMN description_tr TEXT NOT NULL DEFAULT '';`);
    }
    if (!roleCols.has('description_en')) {
      db.exec(`ALTER TABLE roles ADD COLUMN description_en TEXT NOT NULL DEFAULT '';`);
    }
    if (!roleCols.has('created_at')) {
      db.exec(`ALTER TABLE roles ADD COLUMN created_at TEXT NOT NULL DEFAULT '';`);
    }

    const userCols = getColumnNames(db, 'users');
    if (userCols.has('email') || !userCols.has('key_hash')) {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('BEGIN IMMEDIATE;');
      try {
        db.exec(`
          CREATE TABLE users_v2 (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            username_normalized TEXT NOT NULL UNIQUE,
            key_hash TEXT UNIQUE,
            key_type TEXT NOT NULL DEFAULT 'MEMBER',
            avatar_url TEXT NOT NULL DEFAULT '',
            rank TEXT NOT NULL DEFAULT 'UYE' REFERENCES roles(id),
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            mfa_enabled INTEGER NOT NULL DEFAULT 0,
            mfa_secret TEXT,
            last_active_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        const oldUsers = db.prepare(`SELECT * FROM users ORDER BY created_at ASC`).all() as any[];
        const usedNormalized = new Set<string>();
        const insertV2 = db.prepare(
          `INSERT INTO users_v2 (id, username, username_normalized, key_hash, key_type, avatar_url, rank, status, mfa_enabled, mfa_secret, last_active_at, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const u of oldUsers) {
          let uname = String(u.username || `member_${String(u.id).slice(-6)}`).trim();
          let norm = uname.toLowerCase();
          if (usedNormalized.has(norm)) {
            uname = `${uname}_${String(u.id).slice(-4)}`;
            norm = uname.toLowerCase();
          }
          usedNormalized.add(norm);
          insertV2.run(
            u.id,
            uname,
            norm,
            u.rank === 'ADMIN' ? 'ADMIN' : 'MEMBER',
            u.avatar_url || '',
            u.rank || 'UYE',
            u.status || 'ACTIVE',
            u.mfa_enabled || 0,
            u.mfa_secret || null,
            u.last_active_at || null,
            u.created_at || now,
            now
          );
        }

        db.exec(`UPDATE user_sessions SET revoked = 1;`);
        db.exec(`DROP TABLE users;`);
        db.exec(`ALTER TABLE users_v2 RENAME TO users;`);
        db.exec('COMMIT;');
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // ignore
        }
        throw err;
      } finally {
        db.exec('PRAGMA foreign_keys = ON;');
      }
    }

    const attemptCols = getColumnNames(db, 'login_attempts');
    if (attemptCols.has('email') && !attemptCols.has('identifier_hash')) {
      db.exec(`
        DROP TABLE IF EXISTS login_attempts;
        CREATE TABLE login_attempts (
          id TEXT PRIMARY KEY,
          identifier_hash TEXT NOT NULL,
          ip_address TEXT NOT NULL,
          success INTEGER NOT NULL,
          failure_reason TEXT,
          created_at TEXT NOT NULL
        );
      `);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_custom_roles (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS pending_registrations (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        key_hash TEXT NOT NULL UNIQUE,
        preferred_lang TEXT NOT NULL DEFAULT 'tr',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS content_reports (
        id TEXT PRIMARY KEY,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        action_taken TEXT,
        resolution_note TEXT,
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT,
        actor_username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        summary TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        prev_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        user_id TEXT,
        ip_address TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_permission_overrides (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        target_id TEXT,
        permission_key TEXT,
        effect TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS category_permissions (
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        effect TEXT NOT NULL,
        PRIMARY KEY (category_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS archive_permissions (
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        effect TEXT NOT NULL,
        PRIMARY KEY (archive_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS archive_files (
        id TEXT PRIMARY KEY,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        download_permission TEXT NOT NULL DEFAULT 'INHERIT',
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        scan_status TEXT NOT NULL DEFAULT 'CLEAN',
        download_count INTEGER NOT NULL DEFAULT 0,
        uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS archive_tags (
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (archive_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS favorites (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, archive_id)
      );

      CREATE TABLE IF NOT EXISTS recently_viewed (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        viewed_at TEXT NOT NULL,
        PRIMARY KEY (user_id, archive_id)
      );

      CREATE TABLE IF NOT EXISTS bans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ban_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        issued_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        expires_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        lifted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        lifted_reason TEXT,
        lifted_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        id TEXT PRIMARY KEY,
        identifier_hash TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        success INTEGER NOT NULL,
        failure_reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS favorites (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, archive_id)
      );

      CREATE TABLE IF NOT EXISTS translations (
        key TEXT NOT NULL,
        lang TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (key, lang)
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`).run(
      1,
      'initial_schema',
      now
    );
    db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`).run(
      2,
      'key_auth_custom_roles_reports',
      now
    );
  }

  // Migration 3: Unify Admin System into single ADMIN + extend archives & archive_files columns non-destructively
  if (!applied.has(3)) {
    const now = new Date().toISOString();

    if (dbPath !== ':memory:' && tableExists(db, 'users')) {
      const userCount = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;
      if (userCount > 0) {
        const backupDir = path.join(path.dirname(dbPath), 'backups');
        createDatabaseBackup(db, backupDir, 'pre_v3_unified_admin_migration');
      }
    }

    const archiveCols = getColumnNames(db, 'archives');
    if (!archiveCols.has('source_info')) {
      db.exec(`ALTER TABLE archives ADD COLUMN source_info TEXT NOT NULL DEFAULT '';`);
    }
    if (!archiveCols.has('is_featured')) {
      db.exec(`ALTER TABLE archives ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;`);
    }

    const fileCols = getColumnNames(db, 'archive_files');
    if (!fileCols.has('title')) {
      db.exec(`ALTER TABLE archive_files ADD COLUMN title TEXT NOT NULL DEFAULT '';`);
    }
    if (!fileCols.has('description')) {
      db.exec(`ALTER TABLE archive_files ADD COLUMN description TEXT NOT NULL DEFAULT '';`);
    }
    if (!fileCols.has('download_permission')) {
      db.exec(`ALTER TABLE archive_files ADD COLUMN download_permission TEXT NOT NULL DEFAULT 'INHERIT';`);
    }

    const legacyAdmins = db
      .prepare(
        `SELECT u.id, u.username, ar.profile
         FROM users u
         LEFT JOIN admin_roles ar ON ar.user_id = u.id
         WHERE u.rank = 'ADMIN' OR u.key_type = 'ADMIN' OR ar.profile IS NOT NULL
         ORDER BY CASE ar.profile
           WHEN 'PRIMARY_ADMIN' THEN 0
           WHEN 'ADMIN' THEN 1
           WHEN 'ARCHIVE_ADMIN' THEN 2
           WHEN 'SECURITY_ADMIN' THEN 3
           ELSE 4
         END, u.created_at ASC`
      )
      .all() as Array<{ id: string; username: string; profile: string | null }>;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (legacyAdmins.length > 0) {
        const survivor = legacyAdmins[0];

        // Invalidate ALL previous admin keys & active admin sessions (compromised credential migration)
        db.exec(
          `UPDATE user_sessions
           SET revoked = 1
           WHERE user_id IN (SELECT id FROM users WHERE rank = 'ADMIN' OR key_type = 'ADMIN')
              OR user_id IN (SELECT user_id FROM admin_roles)`
        );

        db.exec(`DELETE FROM admin_roles`);

        // Retire secondary legacy admin profiles non-destructively (preserve records/audit references)
        const retiredAdmins = legacyAdmins.slice(1);
        const retireStmt = db.prepare(
          `UPDATE users
           SET rank = 'UYE', key_type = 'MEMBER', status = 'SUSPENDED', key_hash = ?, updated_at = ?
           WHERE id = ?`
        );
        for (const r of retiredAdmins) {
          retireStmt.run(`REVOKED_${crypto.randomBytes(24).toString('hex')}`, now, r.id);
        }

        // Elevate sole surviving ADMIN account with rotation marker so ensureBootstrapAdmins rotates fresh CSPRNG key
        db.prepare(
          `UPDATE users
           SET rank = 'ADMIN', key_type = 'ADMIN', status = 'ACTIVE', key_hash = ?, updated_at = ?
           WHERE id = ?`
        ).run(`NEEDS_ROTATION_${survivor.id}`, now, survivor.id);

        db.prepare(
          `INSERT INTO admin_roles (user_id, profile, granted_by, created_at)
           VALUES (?, 'ADMIN', 'SYSTEM_V3_MIGRATION', ?)`
        ).run(survivor.id, now);

        appendAuditLog(db, {
          actorId: survivor.id,
          actorUsername: survivor.username,
          action: 'SYSTEM_ADMIN_UNIFIED',
          targetType: 'system',
          targetId: survivor.id,
          summary: `Unified ${legacyAdmins.length} legacy admin profile(s) into single ADMIN role (${survivor.username}) and rotated credentials`,
          beforeObj: { legacyAdmins: legacyAdmins.map((a) => ({ id: a.id, username: a.username, profile: a.profile })) },
          afterObj: { activeAdminId: survivor.id, activeProfile: 'ADMIN' },
        });
      }

      db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`).run(
        3,
        'unified_admin_and_extended_archive_schema',
        now
      );
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }
  }

  // Always ensure indexes and immutable audit triggers exist
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_norm ON users(username_normalized);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_key_hash ON users(key_hash);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_archives_category ON archives(category_id);
    CREATE INDEX IF NOT EXISTS idx_archives_status ON archives(status);
    CREATE INDEX IF NOT EXISTS idx_archives_featured ON archives(is_featured);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
    CREATE INDEX IF NOT EXISTS idx_overrides_user ON user_permission_overrides(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status);
    CREATE INDEX IF NOT EXISTS idx_user_custom_roles_user ON user_custom_roles(user_id);

    CREATE TRIGGER IF NOT EXISTS prevent_audit_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'Audit logs are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'Audit logs cannot be deleted');
    END;
  `);

  seedStaticGovernanceMetadata(db);
}

function seedStaticGovernanceMetadata(db: DatabaseSync) {
  const now = new Date().toISOString();
  const rolesData: Array<[UserRank, string, string, number, number, number, string]> = [
    ['UYE', 'ÜYE', 'MEMBER', 1, 0, 1, '#7C9386'],
    ['DESTEKCI', 'DESTEKÇİ', 'SUPPORTER', 2, 0, 1, '#557B67'],
    ['ISLETME', 'İŞLETME', 'ENTERPRISE', 3, 0, 1, '#B89B63'],
    ['ADMIN', 'ADMIN', 'ADMIN', 4, 1, 1, '#C9AD75'],
  ];

  const insertRole = db.prepare(
    `INSERT OR IGNORE INTO roles (id, display_name_tr, display_name_en, hierarchy_order, is_admin_role, is_system_rank, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [id, tr, en, ord, isAdmin, isSys, color] of rolesData) {
    insertRole.run(id, tr, en, ord, isAdmin, isSys, color, now);
  }

  const permDefs: Array<[PermissionKey, string, string, string, string, string]> = [
    ['view_archives', 'Archive Access', 'Arşivleri görüntüleme', 'View archives', 'Yayınlanmış arşiv sayfalarını görüntüleme izni.', 'Allows reading published archive dossiers.'],
    ['view_categories', 'Archive Access', 'Kategorileri görüntüleme', 'View categories', 'Kategori dizinini ve kartlarını görüntüleme izni.', 'Allows browsing archive categories.'],
    ['download_files', 'Documents', 'Dosya indirme', 'Download files', 'İmzalı ve süreli indirme bağlantısı üretme izni.', 'Allows requesting signed temporary file downloads.'],
    ['upload_files', 'Documents', 'Dosya yükleme', 'Upload files', 'Arşiv kayıtlarına belge/dosya yükleme yetkisi.', 'Allows uploading validated documents to archives.'],
    ['edit_archives', 'Curation', 'Arşiv düzenleme', 'Edit archives', 'Arşiv başlık ve meta verilerini düzenleme izni.', 'Allows editing archive records and metadata.'],
    ['delete_archives', 'Curation', 'Arşiv silme', 'Delete archives', 'Arşiv kayıtlarını kaldırma/silme izni.', 'Allows deleting archive records.'],
    ['add_favorites', 'Personalization', 'Favori ekleme', 'Add favorites', 'Arşivleri kişisel favorilere ekleme izni.', 'Allows bookmarking archives to favorites.'],
    ['search_archives', 'Discovery', 'Arşiv arama', 'Search archives', 'Arşiv gezgininde arama ve etiket filtreleme izni.', 'Allows searching and filtering archive records.'],
    ['access_special_collections', 'Clearance', 'Özel koleksiyonlara erişim', 'Access special collections', 'Kısıtlı veya küratöryel koleksiyonlara erişim izni.', 'Allows access to restricted curated collections.'],
    ['view_hidden_content', 'Clearance', 'Gizli içerikleri görüntüleme', 'View hidden content', 'HIDDEN durumundaki içeriklere erişim izni.', 'Allows viewing hidden archive items.'],
    ['view_user_profiles', 'Directory', 'Kullanıcı profilini görüntüleme', 'View user profiles', 'Üye profil bilgilerini görüntüleme izni.', 'Allows inspecting member profile summaries.'],
    ['post_comments', 'Interaction', 'Yorum yapma', 'Post comments', 'Arşiv notları veya yorum modülü izni.', 'Allows submitting archive annotations if enabled.'],
  ];

  const insertPerm = db.prepare(
    `INSERT OR IGNORE INTO permissions (key, group_name, label_tr, label_en, description_tr, description_en) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const p of permDefs) {
    insertPerm.run(...p);
  }

  const defaults: Record<Exclude<UserRank, 'ADMIN'>, Record<PermissionKey, boolean>> = {
    UYE: {
      view_archives: true,
      view_categories: true,
      download_files: true,
      upload_files: false,
      edit_archives: false,
      delete_archives: false,
      add_favorites: true,
      search_archives: true,
      access_special_collections: false,
      view_hidden_content: false,
      view_user_profiles: false,
      post_comments: false,
    },
    DESTEKCI: {
      view_archives: true,
      view_categories: true,
      download_files: true,
      upload_files: false,
      edit_archives: false,
      delete_archives: false,
      add_favorites: true,
      search_archives: true,
      access_special_collections: true,
      view_hidden_content: false,
      view_user_profiles: true,
      post_comments: true,
    },
    ISLETME: {
      view_archives: true,
      view_categories: true,
      download_files: true,
      upload_files: false,
      edit_archives: false,
      delete_archives: false,
      add_favorites: true,
      search_archives: true,
      access_special_collections: true,
      view_hidden_content: true,
      view_user_profiles: true,
      post_comments: true,
    },
  };

  const insertRP = db.prepare(
    `INSERT OR IGNORE INTO role_permissions (role_id, permission_key, allowed) VALUES (?, ?, ?)`
  );
  for (const rank of ['UYE', 'DESTEKCI', 'ISLETME'] as const) {
    for (const perm of ALL_PERMISSIONS) {
      insertRP.run(rank, perm, defaults[rank][perm] ? 1 : 0);
    }
  }
  for (const perm of ALL_PERMISSIONS) {
    insertRP.run('ADMIN', perm, 1);
  }

  const defaultSettings: Array<[string, string]> = [
    ['default_language', 'tr'],
    ['fallback_language', 'tr'],
    ['auth_mode', 'ACCESS_KEY_ONLY'],
    ['key_only_auth_enforced', 'true'],
    ['captcha_enabled', 'true'],
    ['max_login_attempts_window', '8'],
    ['signed_url_ttl_seconds', '120'],
    ['maintenance_mode', 'false'],
  ];
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)`
  );
  for (const [k, v] of defaultSettings) {
    insertSetting.run(k, v, now);
  }
}

function generateUniqueAccessKeyForDb(db: DatabaseSync, keyPepper: string): { rawKey: string; keyHash: string } {
  for (let attempt = 0; attempt < 16; attempt++) {
    const rawKey = generateAccessKey();
    const keyHash = hashAccessKey(rawKey, keyPepper);
    const existsInUsers = db.prepare(`SELECT 1 FROM users WHERE key_hash = ?`).get(keyHash);
    const existsInPending = db.prepare(`SELECT 1 FROM pending_registrations WHERE key_hash = ?`).get(keyHash);
    if (!existsInUsers && !existsInPending) {
      return { rawKey, keyHash };
    }
  }
  throw new Error('Failed to generate collision-free access key');
}

/**
 * Provisions the single unified ADMIN account strictly using a backend CSPRNG 30-char key.
 * Only HMAC-SHA256 hashes are stored in SQLite; newly generated key is returned in-memory once
 * (and written once to a 0600 gitignored setup file on disk, never logged).
 */
export async function ensureBootstrapAdmins(
  db: DatabaseSync,
  keyPepper: string,
  bootstrapKeysFilePath?: string
): Promise<Partial<Record<AdminProfile, string>>> {
  const now = new Date().toISOString();
  const newlyIssuedKeys: Partial<Record<AdminProfile, string>> = {};
  const spec = BOOTSTRAP_ADMIN_SPEC;

  const existingByProfile = db
    .prepare(
      `SELECT u.id, u.key_hash FROM admin_roles ar JOIN users u ON u.id = ar.user_id WHERE ar.profile = ?`
    )
    .get(spec.profile) as { id: string; key_hash: string | null } | undefined;

  if (
    !existingByProfile ||
    !existingByProfile.key_hash ||
    existingByProfile.key_hash.startsWith('NEEDS_ROTATION_')
  ) {
    const envRaw = process.env[spec.envKeyName];
    let rawKey: string;
    let keyHash: string;
    if (envRaw && isValidAccessKeyFormat(envRaw)) {
      rawKey = normalizeAccessKey(envRaw);
      keyHash = hashAccessKey(rawKey, keyPepper);
    } else {
      const gen = generateUniqueAccessKeyForDb(db, keyPepper);
      rawKey = gen.rawKey;
      keyHash = gen.keyHash;
    }

    if (existingByProfile) {
      db.prepare(
        `UPDATE users SET key_hash = ?, key_type = 'ADMIN', rank = 'ADMIN', status = 'ACTIVE', updated_at = ? WHERE id = ?`
      ).run(keyHash, now, existingByProfile.id);
      db.prepare(`UPDATE user_sessions SET revoked = 1 WHERE user_id = ?`).run(existingByProfile.id);
      newlyIssuedKeys.ADMIN = rawKey;
    } else {
      const userId = `adm_${crypto.randomUUID().slice(0, 8)}`;
      const usernameCandidate = db
        .prepare(`SELECT id FROM users WHERE username_normalized = ?`)
        .get(spec.username.toLowerCase())
        ? `${spec.username}_${crypto.randomBytes(2).toString('hex')}`
        : spec.username;

      db.prepare(
        `INSERT INTO users (id, username, username_normalized, key_hash, key_type, avatar_url, rank, status, mfa_enabled, last_active_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ADMIN', '', 'ADMIN', 'ACTIVE', 0, ?, ?, ?)`
      ).run(userId, usernameCandidate, usernameCandidate.toLowerCase(), keyHash, now, now, now);

      db.prepare(
        `INSERT OR IGNORE INTO user_preferences (user_id, preferred_lang, updated_at) VALUES (?, 'tr', ?)`
      ).run(userId, now);

      db.prepare(
        `INSERT OR IGNORE INTO admin_roles (user_id, profile, granted_by, created_at) VALUES (?, 'ADMIN', 'SYSTEM_BOOTSTRAP', ?)`
      ).run(userId, now);

      newlyIssuedKeys.ADMIN = rawKey;
    }
  }

  if (bootstrapKeysFilePath && newlyIssuedKeys.ADMIN) {
    fs.mkdirSync(path.dirname(bootstrapKeysFilePath), { recursive: true });
    const lines = [
      '# SENTARIKA ARCHIVE — UNIFIED ADMIN ACCESS KEY (DISPLAYED ONCE)',
      `# Generated at: ${now}`,
      '# Store this key securely and remove or protect this file on production servers.',
      '# Database stores ONLY HMAC-SHA256 hashes; this key cannot be recovered later.',
      '',
      `ADMIN=${newlyIssuedKeys.ADMIN}`,
      '',
    ];
    fs.writeFileSync(bootstrapKeysFilePath, lines.join('\n'), { mode: 0o600 });
  }

  return newlyIssuedKeys;
}

export function appendAuditLog(
  db: DatabaseSync,
  entry: {
    actorId: string | null;
    actorUsername: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    summary: string;
    beforeObj?: unknown;
    afterObj?: unknown;
  }
): void {
  const lastRow = db
    .prepare(`SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1`)
    .get() as { entry_hash: string } | undefined;
  const prevHash = lastRow?.entry_hash || 'GENESIS';
  const createdAt = new Date().toISOString();
  const targetId = entry.targetId ?? null;

  const entryHash = computeAuditHash({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId,
    summary: entry.summary,
    prevHash,
    createdAt,
  });

  db.prepare(
    `INSERT INTO audit_logs (actor_id, actor_username, action, target_type, target_id, summary, before_json, after_json, prev_hash, entry_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.actorId,
    entry.actorUsername,
    entry.action,
    entry.targetType,
    targetId,
    entry.summary,
    entry.beforeObj !== undefined ? JSON.stringify(entry.beforeObj) : null,
    entry.afterObj !== undefined ? JSON.stringify(entry.afterObj) : null,
    prevHash,
    entryHash,
    createdAt
  );
}

export function recordSecurityEvent(
  db: DatabaseSync,
  event: {
    eventType: string;
    severity: 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL';
    userId?: string | null;
    ipAddress: string;
    details: string;
  }
): void {
  db.prepare(
    `INSERT INTO security_events (id, event_type, severity, user_id, ip_address, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    event.eventType,
    event.severity,
    event.userId ?? null,
    event.ipAddress,
    event.details,
    new Date().toISOString()
  );
}
