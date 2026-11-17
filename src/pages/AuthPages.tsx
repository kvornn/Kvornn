import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  KeyRound,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, ApiError } from '../lib/api';
import { ResilientImage } from '../components/CategoryVisuals';

interface ChallengeData {
  challengeId: string;
  promptTr: string;
  promptEn: string;
  expiresAt: number;
  signature: string;
  turnstileSiteKey: string | null;
}

export function LoginPage() {
  const { lang, t, navigate, setUser, setBanInfo } = useApp();
  const [accessKey, setAccessKey] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadChallenge = useCallback(async () => {
    try {
      const ch = await apiRequest<ChallengeData>('/api/auth/challenge');
      setChallenge(ch);
      setCaptchaAnswer('');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const normalizedKeyLen = accessKey.trim().replace(/[^a-zA-Z0-9]/g, '').length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ mfaRequired?: boolean; user?: any }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          accessKey,
          mfaCode: mfaRequired ? mfaCode : undefined,
          captcha: challenge
            ? {
                challengeId: challenge.challengeId,
                answer: captchaAnswer,
                expiresAt: challenge.expiresAt,
                signature: challenge.signature,
              }
            : {},
        }),
      });

      if (res.mfaRequired) {
        setMfaRequired(true);
        void loadChallenge();
        setSubmitting(false);
        return;
      }

      if (res.user) {
        setUser(res.user);
        setBanInfo(null);
        navigate(res.user.rank === 'ADMIN' ? '/admin' : '/dashboard');
      }
    } catch (err) {
      void loadChallenge();
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_BANNED' && err.ban) {
          setBanInfo(err.ban);
          navigate('/suspended');
          return;
        }
        if (err.code === 'RATE_LIMITED') {
          setError(t.auth.rateLimited);
        } else if (err.code === 'INVALID_ACCESS_KEY') {
          setError(t.auth.invalidAccessKey);
        } else {
          setError(err.message);
        }
      } else {
        setError(t.auth.invalidAccessKey);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-[1160px] items-center px-6 py-12">
      <div className="grid w-full grid-cols-1 overflow-hidden rounded-xl border border-[#223029] bg-[#101715] lg:grid-cols-12">
        <div className="relative hidden lg:block lg:col-span-5 border-r border-[#223029]">
          <ResilientImage
            src="/src/assets/images/sentarika_seal_crest_1794771821147.jpg"
            alt="Sentarika Seal"
            fallbackTitle="SENTARIKA"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090D0C]/90 via-transparent to-transparent" />
          <div className="absolute bottom-8 left-8 right-8">
            <p className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {t.brand}
            </p>
            <p className="mt-2 text-xs tracking-wider text-[#B89B63]">{t.slogan}</p>
          </div>
        </div>

        <div className="p-8 sm:p-12 lg:col-span-7">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-[#B89B63]">
            <KeyRound className="h-3.5 w-3.5" />
            <span>30-CHAR ACCESS KEY AUTH</span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[#E9E7DF]">
            {t.auth.loginTitle}
          </h1>
          <p className="mt-2 text-sm text-[#A9AEA7]">{t.auth.loginSubtitle}</p>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-3 text-sm text-[#F3D1CE]"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-access-key" className="block text-xs font-medium text-[#C8CEC7]">
                  {t.auth.accessKeyLabel}
                </label>
                <span className="font-mono text-xs text-[#8D968F] tabular-nums">
                  {normalizedKeyLen} / 30
                </span>
              </div>
              <input
                id="login-access-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value.toUpperCase())}
                className="mt-2 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-3.5 font-mono text-sm tracking-widest text-[#B89B63] focus:border-[#B89B63] focus:outline-none"
                placeholder={t.auth.accessKeyPlaceholder}
              />
            </div>

            {mfaRequired && (
              <div className="rounded-md border border-[#B89B63]/40 bg-[#151E1A] p-4">
                <p className="text-xs text-[#E9E7DF] mb-2">{t.auth.mfaRequired}</p>
                <label htmlFor="login-mfa" className="block text-xs font-medium text-[#B89B63]">
                  {t.auth.mfaCode}
                </label>
                <input
                  id="login-mfa"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="mt-2 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-3 font-mono text-base tracking-[0.3em] text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
                  placeholder="000000"
                />
              </div>
            )}

            {challenge && (
              <div className="rounded-md border border-[#24322B] bg-[#0D1311] p-4">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="login-captcha"
                    className="flex items-center gap-2 text-xs font-medium text-[#C8CEC7]"
                  >
                    <Shield className="h-3.5 w-3.5 text-[#557B67]" />
                    <span>
                      {t.auth.captchaPrompt}:{' '}
                      <strong className="text-[#E9E7DF]">
                        {lang === 'tr' ? challenge.promptTr : challenge.promptEn}
                      </strong>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadChallenge()}
                    className="text-xs text-[#8D968F] hover:text-[#E9E7DF]"
                    aria-label="Refresh security challenge"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  id="login-captcha"
                  type="text"
                  required
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  className="mt-2.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3.5 py-2.5 font-mono text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-[#B89B63] px-5 py-3 text-sm font-semibold text-[#090D0C] transition-colors hover:bg-[#C9AD75] disabled:opacity-50"
            >
              {t.auth.submitLogin}
            </button>
          </form>

          <p className="mt-4 rounded-md border border-[#223029] bg-[#0D1311] px-4 py-3 text-[11px] leading-relaxed text-[#A9AEA7]">
            {t.auth.zeroRecoveryWarning}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#8D968F]">
            <span>
              {t.auth.noAccount}{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="font-medium text-[#B89B63] hover:underline"
              >
                {t.nav.register}
              </button>
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/about')}
                className="hover:text-[#E9E7DF]"
              >
                {t.legal.aboutLink}
              </button>
              <button
                type="button"
                onClick={() => navigate('/terms')}
                className="hover:text-[#E9E7DF]"
              >
                {t.legal.termsLink}
              </button>
              <button
                type="button"
                onClick={() => navigate('/privacy')}
                className="hover:text-[#E9E7DF]"
              >
                {t.legal.privacyLink}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

interface PendingKeyState {
  registrationToken: string;
  accessKey: string;
  username: string;
  expiresAt: string;
}

export function RegisterPage() {
  const { lang, t, navigate, setUser } = useApp();
  const [username, setUsername] = useState('');
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [pendingKey, setPendingKey] = useState<PendingKeyState | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadChallenge = useCallback(async () => {
    try {
      const ch = await apiRequest<ChallengeData>('/api/auth/challenge');
      setChallenge(ch);
      setCaptchaAnswer('');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<PendingKeyState>('/api/auth/register/generate', {
        method: 'POST',
        body: JSON.stringify({
          username,
          preferredLang: lang,
          captcha: challenge
            ? {
                challengeId: challenge.challengeId,
                answer: captchaAnswer,
                expiresAt: challenge.expiresAt,
                signature: challenge.signature,
              }
            : {},
        }),
      });
      setPendingKey(res);
      setAcknowledged(false);
      setCopied(false);
      setDownloaded(false);
    } catch (err) {
      void loadChallenge();
      setError(err instanceof Error ? err.message : 'Key generation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyKey = async () => {
    if (!pendingKey) return;
    try {
      await navigator.clipboard.writeText(pendingKey.accessKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadBackup = () => {
    if (!pendingKey) return;
    const content = [
      '============================================================',
      'SENTARIKA ARCHIVE — ACCESS KEY BACKUP',
      '"KNOWLEDGE NEVER DISAPPEARS."',
      '============================================================',
      `Username: ${pendingKey.username}`,
      `Access Key (30 chars): ${pendingKey.accessKey}`,
      `Generated At: ${new Date().toISOString()}`,
      '',
      t.auth.zeroRecoveryWarning,
      '============================================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentarika-access-key-${pendingKey.username}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const handleCompleteRegistration = async () => {
    if (!pendingKey || !acknowledged) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: any }>('/api/auth/register/complete', {
        method: 'POST',
        body: JSON.stringify({
          registrationToken: pendingKey.registrationToken,
          acknowledgedNoRecovery: true,
        }),
      });
      setUser(res.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-[760px] items-center px-6 py-12">
      <div className="w-full rounded-xl border border-[#223029] bg-[#101715] p-8 sm:p-10">
        <h1 className="font-display text-3xl font-semibold text-[#E9E7DF]">
          {t.auth.registerTitle}
        </h1>
        <p className="mt-2 text-sm text-[#A9AEA7]">{t.auth.registerSubtitle}</p>
        <p className="mt-3 text-xs text-[#557B67]">{t.auth.rankNotice}</p>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-3 text-sm text-[#F3D1CE]"
          >
            {error}
          </div>
        )}

        {!pendingKey ? (
          <form onSubmit={handleGenerateKey} className="mt-6 space-y-5">
            <div>
              <label htmlFor="reg-username" className="block text-xs font-medium text-[#C8CEC7]">
                {t.auth.username}
              </label>
              <input
                id="reg-username"
                type="text"
                required
                minLength={3}
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-3 text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
                placeholder="archivist_01"
              />
            </div>

            {challenge && (
              <div className="rounded-md border border-[#24322B] bg-[#0D1311] p-4">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="reg-captcha"
                    className="flex items-center gap-2 text-xs font-medium text-[#C8CEC7]"
                  >
                    <Shield className="h-3.5 w-3.5 text-[#557B67]" />
                    <span>
                      {t.auth.captchaPrompt}:{' '}
                      <strong className="text-[#E9E7DF]">
                        {lang === 'tr' ? challenge.promptTr : challenge.promptEn}
                      </strong>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadChallenge()}
                    className="text-xs text-[#8D968F] hover:text-[#E9E7DF]"
                    aria-label="Refresh security challenge"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  id="reg-captcha"
                  type="text"
                  required
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  className="mt-2.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3.5 py-2.5 font-mono text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#B89B63] px-5 py-3.5 text-sm font-semibold text-[#090D0C] transition-colors hover:bg-[#C9AD75] disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              <span>{t.auth.generateKeyBtn}</span>
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="rounded-lg border border-[#B89B63]/50 bg-[#090D0C] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-[#B89B63]">
                  {t.auth.generatedKeyTitle}
                </span>
                <span className="font-mono text-xs text-[#8D968F]">
                  @{pendingKey.username} · 30 CHARS
                </span>
              </div>

              <div
                data-testid="generated-access-key"
                className="mt-4 select-all break-all rounded-md border border-[#26352E] bg-[#101715] px-4 py-4 font-mono text-lg font-semibold tracking-[0.14em] text-[#E9E7DF]"
              >
                {pendingKey.accessKey}
              </div>

              <p className="mt-3 text-xs text-[#A9AEA7]">{t.auth.generatedKeySubtitle}</p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleCopyKey()}
                  className="inline-flex items-center gap-2 rounded-md border border-[#2C3A33] bg-[#151E1A] px-4 py-2 text-xs font-medium text-[#E9E7DF] hover:border-[#B89B63]"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#557B67]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? t.auth.copiedKey : t.auth.copyKey}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="inline-flex items-center gap-2 rounded-md border border-[#2C3A33] bg-[#151E1A] px-4 py-2 text-xs font-medium text-[#E9E7DF] hover:border-[#B89B63]"
                >
                  <Download className="h-3.5 w-3.5 text-[#B89B63]" />
                  <span>{t.auth.downloadBackup}</span>
                  {downloaded && <Check className="h-3.5 w-3.5 text-[#557B67]" />}
                </button>
              </div>
            </div>

            <div
              role="alert"
              className="rounded-lg border border-[#9E3B33]/70 bg-[#3B1816]/40 p-5 text-xs leading-relaxed text-[#F3D1CE]"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#E5A93B]" />
                <p className="font-medium">{t.auth.zeroRecoveryWarning}</p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#223029] bg-[#0D1311] p-4 text-xs text-[#E9E7DF]">
              <input
                id="reg-ack-checkbox"
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#B89B63]"
              />
              <span>{t.auth.acknowledgeCheckbox}</span>
            </label>

            <button
              type="button"
              disabled={!acknowledged || submitting}
              onClick={() => void handleCompleteRegistration()}
              className="w-full rounded-md bg-[#B89B63] px-5 py-3.5 text-sm font-semibold text-[#090D0C] transition-colors hover:bg-[#C9AD75] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.auth.completeRegister}
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#8D968F]">
          <span>
            {t.auth.hasAccount}{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="font-medium text-[#B89B63] hover:underline"
            >
              {t.nav.login}
            </button>
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/about')}
              className="hover:text-[#E9E7DF]"
            >
              {t.legal.aboutLink}
            </button>
            <button
              type="button"
              onClick={() => navigate('/terms')}
              className="hover:text-[#E9E7DF]"
            >
              {t.legal.termsLink}
            </button>
            <button
              type="button"
              onClick={() => navigate('/privacy')}
              className="hover:text-[#E9E7DF]"
            >
              {t.legal.privacyLink}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
