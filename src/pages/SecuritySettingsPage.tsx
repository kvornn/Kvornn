import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Monitor, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';

interface SessionRow {
  id: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: string;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export function SecuritySettingsPage() {
  const { user, setUser, lang, t } = useApp();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [mfaSetup, setMfaSetup] = useState<{ secretBase32: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiRequest<{ sessions: SessionRow[] }>('/api/security/sessions');
      setSessions(res.sessions);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  if (!user) return null;

  const startMfaSetup = async () => {
    setErrorMsg('');
    setStatusMsg('');
    try {
      const res = await apiRequest<{ secretBase32: string; qrDataUrl: string }>(
        '/api/security/mfa/setup',
        { method: 'POST' }
      );
      setMfaSetup(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'MFA setup failed');
    }
  };

  const verifyAndEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/security/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode }),
      });
      setUser({ ...user, mfaEnabled: true });
      setMfaSetup(null);
      setMfaCode('');
      setStatusMsg('MFA activated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid TOTP code');
    }
  };

  const disableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/security/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode }),
      });
      setUser({ ...user, mfaEnabled: false });
      setMfaCode('');
      setStatusMsg('MFA disabled.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid TOTP code');
    }
  };

  const revokeSession = async (id: string) => {
    await apiRequest(`/api/security/sessions/${id}`, { method: 'DELETE' });
    void loadSessions();
  };

  const revokeOthers = async () => {
    await apiRequest('/api/security/sessions/revoke-others', { method: 'POST' });
    void loadSessions();
  };

  return (
    <main className="mx-auto max-w-[960px] px-6 py-10 space-y-8">
      <div className="border-b border-[#1D2823] pb-6">
        <h1 className="font-display text-4xl font-semibold text-[#E9E7DF]">
          {t.security.title}
        </h1>
        <p className="mt-2 text-sm text-[#A9AEA7]">{t.security.subtitle}</p>
      </div>

      {statusMsg && (
        <div className="rounded-md border border-[#557B67]/60 bg-[#15241D] px-4 py-3 text-sm text-[#D6EAE0]">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div
          role="alert"
          className="rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-3 text-sm text-[#F3D1CE]"
        >
          {errorMsg}
        </div>
      )}

      {/* Key-Only Policy Section (No recovery / no password) */}
      <section className="rounded-xl border border-[#223029] bg-[#101715] p-8">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-1 h-5 w-5 shrink-0 text-[#B89B63]" />
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {t.security.keyPolicyTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#A9AEA7]">
              {t.security.keyPolicyDesc}
            </p>
            <p className="mt-3 font-mono text-xs text-[#557B67]">
              {t.profile.keyTypeLabel}: {user.keyType}
            </p>
          </div>
        </div>
      </section>

      {/* TOTP MFA Section */}
      <section className="rounded-xl border border-[#223029] bg-[#101715] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-[#B89B63]" />
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
                {t.security.mfaTitle}
              </h2>
              <p className="text-xs text-[#8D968F]">
                {user.mfaEnabled ? t.security.mfaEnabled : t.security.mfaDisabled}
              </p>
            </div>
          </div>
          {!user.mfaEnabled && !mfaSetup && (
            <button
              type="button"
              onClick={() => void startMfaSetup()}
              className="rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C]"
            >
              {t.security.enableMfa}
            </button>
          )}
        </div>

        {mfaSetup && !user.mfaEnabled && (
          <form onSubmit={verifyAndEnableMfa} className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-12 items-center border-t border-[#1D2823] pt-6">
            <div className="sm:col-span-4 flex justify-center">
              <img
                src={mfaSetup.qrDataUrl}
                alt="TOTP QR Code"
                className="h-44 w-44 rounded-md border border-[#26352E]"
              />
            </div>
            <div className="sm:col-span-8 space-y-4">
              <div>
                <p className="text-xs text-[#8D968F]">Manual Secret (Base32)</p>
                <p className="mt-1 font-mono text-xs text-[#B89B63] break-all">
                  {mfaSetup.secretBase32}
                </p>
              </div>
              <div>
                <label htmlFor="mfa-verify-code" className="block text-xs text-[#C8CEC7]">
                  {t.auth.mfaCode}
                </label>
                <input
                  id="mfa-verify-code"
                  type="text"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="mt-2 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-2.5 font-mono text-sm tracking-widest text-[#E9E7DF]"
                  placeholder="123456"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-[#B89B63] px-5 py-2.5 text-xs font-semibold text-[#090D0C]"
              >
                {t.security.verifyMfa}
              </button>
            </div>
          </form>
        )}

        {user.mfaEnabled && (
          <form onSubmit={disableMfa} className="mt-6 flex flex-wrap items-end gap-3 border-t border-[#1D2823] pt-5">
            <div>
              <label htmlFor="mfa-disable-code" className="block text-xs text-[#C8CEC7]">
                {t.auth.mfaCode}
              </label>
              <input
                id="mfa-disable-code"
                type="text"
                maxLength={6}
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="mt-1.5 rounded-md border border-[#26352E] bg-[#090D0C] px-3.5 py-2 font-mono text-sm text-[#E9E7DF]"
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              className="rounded-md border border-[#9E3B33]/70 bg-[#3B1816]/40 px-4 py-2 text-xs font-medium text-[#F3D1CE]"
            >
              {t.security.disableMfa}
            </button>
          </form>
        )}
      </section>

      {/* Active Sessions */}
      <section className="rounded-xl border border-[#223029] bg-[#101715] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {t.security.sessionsTitle}
          </h2>
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={() => void revokeOthers()}
              className="rounded-md border border-[#9E3B33]/60 px-3.5 py-1.5 text-xs text-[#F3D1CE] hover:bg-[#3B1816]/40"
            >
              {t.security.revokeAll}
            </button>
          )}
        </div>

        <div className="mt-5 divide-y divide-[#1D2823] border-t border-[#1D2823]">
          {sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3 min-w-0">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-[#557B67]" />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[#E9E7DF] tabular-nums">
                    {s.ipAddress}
                    {s.isCurrent ? ` · ${t.security.currentSession}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-[#8D968F] truncate max-w-md">{s.userAgent}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#6F7871] tabular-nums">
                    {new Date(s.lastSeenAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                  </p>
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => void revokeSession(s.id)}
                  className="rounded border border-[#2C3A33] px-3 py-1.5 text-xs text-[#C8CEC7] hover:border-[#9E3B33] hover:text-[#F3D1CE]"
                >
                  {t.security.revokeSession}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
