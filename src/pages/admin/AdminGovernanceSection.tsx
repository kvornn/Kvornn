import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Database, Download, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { AuditLogDTO, BackupSnapshotDTO } from '../../shared/types';

export function AdminAuditSection() {
  const { lang, t } = useApp();
  const [logs, setLogs] = useState<AuditLogDTO[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [verification, setVerification] = useState<{
    totalEntries: number;
    valid: boolean;
    brokenIndex: number | null;
  } | null>(null);

  const loadLogs = useCallback(async () => {
    const query = actionFilter.trim() ? `&action=${encodeURIComponent(actionFilter.trim())}` : '';
    try {
      const res = await apiRequest<{ logs: any[] }>(`/api/admin/audit-logs?limit=100${query}`);
      setLogs(
        res.logs.map((r) => ({
          id: r.id,
          actorId: r.actor_id,
          actorUsername: r.actor_username,
          action: r.action,
          targetType: r.target_type,
          targetId: r.target_id,
          summary: r.summary,
          beforeJson: r.before_json,
          afterJson: r.after_json,
          prevHash: r.prev_hash,
          entryHash: r.entry_hash,
          createdAt: r.created_at,
        }))
      );
    } catch {
      // ignore
    }
  }, [actionFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const verifyChain = async () => {
    const res = await apiRequest<any>('/api/admin/audit-logs/verify');
    setVerification(res);
  };

  return (
    <section className="rounded-xl border border-[#223029] bg-[#101715] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {t.admin.menu.audit}
          </h2>
          <p className="mt-1 text-xs text-[#8D968F]">
            Append-only SHA-256 hash-chained records enforced with database immutability triggers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder={lang === 'tr' ? 'İşlem kodu filtrele...' : 'Filter action code...'}
            className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 font-mono text-xs text-[#E9E7DF]"
          />
          <button
            type="button"
            onClick={() => void verifyChain()}
            className="rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C]"
          >
            {t.admin.verifyChain}
          </button>
        </div>
      </div>

      {verification && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-md border px-4 py-3 text-xs ${
            verification.valid
              ? 'border-[#557B67]/60 bg-[#15241D] text-[#D6EAE0]'
              : 'border-[#9E3B33]/60 bg-[#3B1816]/50 text-[#F3D1CE]'
          }`}
        >
          {verification.valid ? (
            <CheckCircle2 className="h-4 w-4 text-[#557B67]" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-[#E58A82]" />
          )}
          <span>
            {verification.valid
              ? `Integrity Verified: ${verification.totalEntries} chained entries intact.`
              : `Tamper detected at index ${verification.brokenIndex}.`}
          </span>
        </div>
      )}

      <div className="mt-5 divide-y divide-[#1D2823] border-t border-[#1D2823]">
        {logs.map((l) => (
          <div key={l.id} className="py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[#B89B63]">
                #{l.id} · {l.action}
              </span>
              <span className="font-mono text-[11px] text-[#8D968F] tabular-nums">
                {new Date(l.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
              </span>
            </div>
            <p className="mt-1 text-[#E9E7DF]">{l.summary}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-[#6F7871]">
              Hash: {l.entryHash}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AdminBackupsSection() {
  const { lang, t } = useApp();
  const [backups, setBackups] = useState<BackupSnapshotDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadBackups = useCallback(async () => {
    try {
      const res = await apiRequest<{ backups: BackupSnapshotDTO[] }>('/api/admin/backups');
      setBackups(res.backups || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to list backups');
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const triggerBackup = async () => {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiRequest<BackupSnapshotDTO>('/api/admin/backup', {
        method: 'POST',
      });
      setMsg(
        lang === 'tr'
          ? `Veritabanı yedeği alındı: ${res.filename} (${res.sizeBytes} bayt)`
          : `Database snapshot created: ${res.filename} (${res.sizeBytes} bytes)`
      );
      await loadBackups();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#223029] bg-[#101715] p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {t.admin.menu.backups} ({backups.length})
          </h2>
          <p className="mt-1 text-xs text-[#8D968F]">
            {lang === 'tr'
              ? 'SQLite VACUUM INTO ile tutarlı anlık yedekler oluşturun ve güvenli olarak indirin.'
              : 'Create atomic SQLite snapshots via VACUUM INTO and download verified backup archives.'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void triggerBackup()}
          className="inline-flex items-center gap-2 rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C] hover:bg-[#C9AD75] disabled:opacity-50"
        >
          <Database className="h-3.5 w-3.5" />
          <span>{lang === 'tr' ? 'Anlık Veritabanı Yedeği Al' : 'Create DB Snapshot'}</span>
        </button>
      </div>

      {msg && (
        <div className="rounded border border-[#557B67]/60 bg-[#15241D] px-4 py-2.5 text-xs text-[#D6EAE0]">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-2.5 text-xs text-[#F3D1CE]">
          {err}
        </div>
      )}

      {backups.length === 0 ? (
        <p className="text-sm text-[#8D968F]">
          {lang === 'tr' ? 'Henüz oluşturulmuş yedek yok.' : 'No snapshots stored yet.'}
        </p>
      ) : (
        <div className="divide-y divide-[#1D2823] border-t border-[#1D2823]">
          {backups.map((b) => (
            <div key={b.filename} className="flex flex-wrap items-center justify-between gap-4 py-4 text-xs">
              <div>
                <p className="font-mono font-medium text-[#E9E7DF]">{b.filename}</p>
                <p className="mt-0.5 font-mono text-[11px] text-[#8D968F] tabular-nums">
                  {(b.sizeBytes / 1024).toFixed(1)} KB ·{' '}
                  {new Date(b.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                </p>
              </div>
              <a
                href={`/api/admin/backups/${encodeURIComponent(b.filename)}/download`}
                download={b.filename}
                className="inline-flex items-center gap-1.5 rounded border border-[#26352E] bg-[#090D0C] px-3 py-1.5 text-xs font-medium text-[#B89B63] hover:border-[#B89B63]"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{lang === 'tr' ? 'İndir (.db)' : 'Download (.db)'}</span>
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AdminSettingsSection() {
  const { lang, t } = useApp();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiRequest<{ settings: Array<{ key: string; value: string }> }>(
        '/api/admin/settings'
      );
      setSettings(Object.fromEntries(res.settings.map((s) => [s.key, s.value])));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-5 rounded-xl border border-[#223029] bg-[#101715] p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {t.admin.menu.settings}
        </h2>
        <p className="mt-1 text-xs text-[#8D968F]">
          {lang === 'tr'
            ? 'Platform yapılandırması, yerelleştirme politikaları ve güvenlik eşikleri.'
            : 'Platform configuration, localization fallbacks, and security enforcement thresholds.'}
        </p>
      </div>

      {saved && (
        <div className="rounded border border-[#557B67]/60 bg-[#15241D] px-3 py-2 text-xs text-[#D6EAE0]">
          {lang === 'tr' ? 'Sistem ayarları güncellendi.' : 'System settings updated.'}
        </div>
      )}
      {err && (
        <div className="rounded border border-[#9E3B33]/60 bg-[#3B1816]/50 px-3 py-2 text-xs text-[#F3D1CE]">
          {err}
        </div>
      )}

      {Object.entries(settings).map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-1 items-center gap-2 border-b border-[#1D2823] pb-3 sm:grid-cols-2"
        >
          <label htmlFor={`set-${k}`} className="font-mono text-xs text-[#C8CEC7]">
            {k}
          </label>
          {k === 'default_language' || k === 'fallback_language' ? (
            <select
              id={`set-${k}`}
              value={v}
              onChange={(e) => setSettings((prev) => ({ ...prev, [k]: e.target.value }))}
              className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-1.5 font-mono text-xs text-[#E9E7DF]"
            >
              <option value="tr">tr (Türkçe)</option>
              <option value="en">en (English)</option>
            </select>
          ) : (
            <input
              id={`set-${k}`}
              type="text"
              value={v}
              onChange={(e) => setSettings((prev) => ({ ...prev, [k]: e.target.value }))}
              className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-1.5 font-mono text-xs text-[#E9E7DF]"
            />
          )}
        </div>
      ))}

      <button
        type="submit"
        className="rounded-md bg-[#B89B63] px-5 py-2 text-xs font-semibold text-[#090D0C]"
      >
        {t.admin.saveChanges}
      </button>
    </form>
  );
}
