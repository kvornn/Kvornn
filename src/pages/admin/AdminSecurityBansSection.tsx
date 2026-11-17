import React, { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function AdminSecuritySection() {
  const { user: actor, lang, t } = useApp();
  const [data, setData] = useState<{ events: any[]; attempts: any[]; activeSessions: any[] }>({
    events: [],
    attempts: [],
    activeSessions: [],
  });
  const [revokeTarget, setRevokeTarget] = useState<{ userId: string; username: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadSecurity = useCallback(async () => {
    try {
      const res = await apiRequest<any>('/api/admin/security');
      setData(res);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ revokedCount: number }>(
        `/api/admin/users/${revokeTarget.userId}/revoke-sessions`,
        { method: 'POST' }
      );
      setMsg(`Terminated ${res.revokedCount} session(s) for ${revokeTarget.username}`);
      setRevokeTarget(null);
      await loadSecurity();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to revoke sessions');
      setRevokeTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={lang === 'tr' ? 'Oturumları Sonlandır' : 'Terminate Sessions'}
        message={
          revokeTarget
            ? lang === 'tr'
              ? `${revokeTarget.username} hesabının tüm aktif oturumlarını sonlandırmak istiyor musunuz?`
              : `Terminate all active sessions for ${revokeTarget.username}?`
            : ''
        }
        danger
        busy={busy}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevokeTarget(null)}
      />

      {msg && (
        <div className="rounded-md border border-[#557B67]/60 bg-[#15241D] px-4 py-2.5 text-xs text-[#D6EAE0]">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-2.5 text-xs text-[#F3D1CE]">
          {err}
        </div>
      )}

      <div className="rounded-xl border border-[#223029] bg-[#101715] p-6">
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {t.admin.menu.security}
        </h2>
        <p className="mt-1 text-xs text-[#8D968F]">
          CSPRNG 30-Char Access Keys · HMAC-SHA256 · HttpOnly SameSite Cookies · CSRF Double-Submit · Sliding Rate Limiter
        </p>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-[#B89B63]">
          Security Events ({data.events.length})
        </h3>
        {data.events.length === 0 ? (
          <p className="mt-3 text-xs text-[#8D968F]">
            {lang === 'tr' ? 'Güvenlik olayı kaydı yok.' : 'No security events recorded.'}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[#1D2823] border-t border-[#1D2823]">
            {data.events.map((ev) => (
              <div key={ev.id} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
                <div>
                  <span className="font-mono text-[#B89B63]">{ev.event_type}</span>
                  <p className="mt-0.5 text-[#E9E7DF]">{ev.details}</p>
                </div>
                <div className="text-right font-mono text-[11px] text-[#8D968F] tabular-nums">
                  <p>
                    {ev.severity} · {ev.ip_address}
                  </p>
                  <p>{new Date(ev.created_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-[#223029] bg-[#101715] p-6">
          <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
            Active Authenticated Sessions ({data.activeSessions.length})
          </h3>
          <div className="mt-4 divide-y divide-[#1D2823] border-t border-[#1D2823]">
            {data.activeSessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-[#E9E7DF]">
                    {s.username} ({s.rank})
                  </p>
                  <p className="truncate text-[11px] text-[#8D968F]">{s.user_agent}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-[#8D968F] tabular-nums">
                    {s.ip_address}
                  </span>
                  {(s.user_id === actor?.id || s.rank !== 'ADMIN') && (
                    <button
                      type="button"
                      onClick={() =>
                        setRevokeTarget({ userId: s.user_id, username: s.username })
                      }
                      className="rounded border border-[#2B3932] p-1 text-[#E58A82] hover:border-[#9E3B33]"
                      title="Revoke sessions"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#223029] bg-[#101715] p-6">
          <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
            {lang === 'tr' ? 'Son Giriş Denemeleri' : 'Recent Login Attempts'} ({data.attempts.length})
          </h3>
          {data.attempts.length === 0 ? (
            <p className="mt-4 text-xs text-[#8D968F]">
              {lang === 'tr' ? 'Kayıtlı deneme yok.' : 'No login attempts recorded yet.'}
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#1D2823] border-t border-[#1D2823]">
              {data.attempts.slice(0, 20).map((att) => (
                <div key={att.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                  <div>
                    <span
                      className={`font-mono font-medium ${
                        att.success ? 'text-[#557B67]' : 'text-[#E58A82]'
                      }`}
                    >
                      {att.success ? 'SUCCESS' : 'REJECTED'}
                    </span>{' '}
                    <span className="text-[#E9E7DF]">{att.username_attempt || 'key-login'}</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#8D968F] tabular-nums">
                    {att.ip_address} ·{' '}
                    {new Date(att.created_at).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
