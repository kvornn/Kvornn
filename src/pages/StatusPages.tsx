import React from 'react';
import { Ban, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function AccessDeniedPage() {
  const { t, navigate } = useApp();
  return (
    <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-[720px] flex-col items-center justify-center px-6 py-16 text-center">
      <ShieldAlert className="h-10 w-10 text-[#B89B63]" />
      <p className="mt-4 font-mono text-xs tracking-widest text-[#B89B63]">
        {t.accessDenied.code}
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-[#E9E7DF]">
        {t.accessDenied.title}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-[#A9AEA7]">
        {t.accessDenied.subtitle}
      </p>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="mt-8 rounded-md bg-[#B89B63] px-6 py-2.5 text-xs font-semibold text-[#090D0C]"
      >
        {t.accessDenied.backHome}
      </button>
    </main>
  );
}

export function AccountSuspendedPage() {
  const { banInfo, lang, t, navigate } = useApp();
  return (
    <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-[760px] flex-col items-center justify-center px-6 py-16">
      <div className="w-full rounded-xl border border-[#9E3B33]/50 bg-[#101715] p-8 sm:p-10">
        <div className="flex items-center gap-3 text-[#E58A82]">
          <Ban className="h-6 w-6 shrink-0" />
          <span className="font-mono text-xs uppercase tracking-widest">
            {banInfo?.status || 'SUSPENDED'}
          </span>
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold text-[#E9E7DF]">
          {t.suspended.title}
        </h1>
        <p className="mt-2 text-sm text-[#A9AEA7]">{t.suspended.subtitle}</p>

        <dl className="mt-6 divide-y divide-[#1D2823] border-y border-[#1D2823] text-sm">
          <div className="py-3.5">
            <dt className="text-xs text-[#8D968F]">{t.suspended.reasonLabel}</dt>
            <dd className="mt-1 text-[#E9E7DF]">
              {banInfo?.reason || 'Account suspended by security administration.'}
            </dd>
          </div>
          <div className="py-3.5">
            <dt className="text-xs text-[#8D968F]">{t.suspended.expiresLabel}</dt>
            <dd className="mt-1 font-mono text-xs text-[#B89B63] tabular-nums">
              {banInfo?.expiresAt
                ? new Date(banInfo.expiresAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
                : t.suspended.permanent}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 rounded-md border border-[#2B3932] bg-[#151E1A] px-5 py-2.5 text-xs font-medium text-[#E9E7DF]"
        >
          {t.nav.overview}
        </button>
      </div>
    </main>
  );
}
