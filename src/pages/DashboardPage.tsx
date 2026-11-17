import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { ArchiveDTO, CategoryDTO } from '../shared/types';
import { resolveLocalizedText } from '../shared/i18n';
import { CategoryCard, ResilientImage } from '../components/CategoryVisuals';

interface DashboardData {
  accessibleCategories: CategoryDTO[];
  recentArchives: ArchiveDTO[];
  favoritesCount: number;
}

export function DashboardPage() {
  const { user, lang, t, navigate } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<DashboardData>('/api/dashboard')
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-10">
      <div className="border-b border-[#1D2823] pb-8">
        <p className="text-xs font-medium tracking-[0.16em] text-[#B89B63]">
          {t.ranks[user.rank]}
          {user.adminProfile ? ` · ${t.adminProfiles[user.adminProfile]}` : ''}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-[#E9E7DF]">
          {t.dashboard.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#A9AEA7]">{t.dashboard.subtitle}</p>
      </div>

      {/* 3-Column Metrics Strip */}
      <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[#223029] bg-[#223029] sm:grid-cols-3">
        <div className="bg-[#101715] px-6 py-5">
          <p className="text-xs text-[#8D968F]">{t.dashboard.accountRank}</p>
          <p className="mt-1.5 font-display text-2xl font-semibold text-[#B89B63]">
            {t.ranks[user.rank]}
          </p>
        </div>
        <div className="bg-[#101715] px-6 py-5">
          <p className="text-xs text-[#8D968F]">{t.dashboard.accessibleCategories}</p>
          <p className="mt-1.5 font-mono text-2xl font-medium text-[#E9E7DF] tabular-nums">
            {data ? data.accessibleCategories.length : '—'}
          </p>
        </div>
        <div className="bg-[#101715] px-6 py-5">
          <p className="text-xs text-[#8D968F]">{t.dashboard.favoritesCount}</p>
          <p className="mt-1.5 font-mono text-2xl font-medium text-[#E9E7DF] tabular-nums">
            {data ? data.favoritesCount : '—'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border border-[#223029] bg-[#101715]" />
          ))}
        </div>
      ) : data && data.accessibleCategories.length === 0 ? (
        <section className="mt-12 grid grid-cols-1 items-center gap-8 overflow-hidden rounded-xl border border-[#223029] bg-[#101715] lg:grid-cols-12">
          <div className="lg:col-span-5 h-64 lg:h-full">
            <ResilientImage
              src="/src/assets/images/sentarika_empty_archive_1794771823840.jpg"
              alt="Empty Digital Archive"
              fallbackTitle="SENTARIKA"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="p-8 lg:col-span-7 lg:p-12">
            <h2 className="font-display text-3xl font-semibold text-[#E9E7DF]">
              {t.dashboard.emptyVaultTitle}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#A9AEA7]">
              {t.dashboard.emptyVaultDesc}
            </p>
            {user.rank === 'ADMIN' && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#B89B63] px-5 py-2.5 text-xs font-semibold text-[#090D0C] hover:bg-[#C9AD75]"
              >
                <span>{t.nav.admin}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="mt-12">
            <div className="flex items-center justify-between border-b border-[#1D2823] pb-3">
              <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
                {t.dashboard.accessibleCategories}
              </h2>
              <button
                type="button"
                onClick={() => navigate('/explorer')}
                className="text-xs font-medium text-[#B89B63] hover:underline"
              >
                {t.nav.explorer}
              </button>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data?.accessibleCategories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  variant="compact"
                  onSelect={(slug) => navigate(`/category/${slug}`)}
                />
              ))}
            </div>
          </section>

          {data && data.recentArchives.length > 0 && (
            <section className="mt-12">
              <h2 className="border-b border-[#1D2823] pb-3 font-display text-2xl font-semibold text-[#E9E7DF]">
                {t.dashboard.recentViews}
              </h2>
              <div className="mt-4 divide-y divide-[#1D2823] border-b border-[#1D2823]">
                {data.recentArchives.map((arc) => {
                  const title = resolveLocalizedText(arc.titleTr, arc.titleEn, lang);
                  const desc = resolveLocalizedText(arc.shortDescTr, arc.shortDescEn, lang);
                  return (
                    <button
                      key={arc.id}
                      type="button"
                      onClick={() => navigate(`/archive/${arc.slug}`)}
                      className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:bg-[#101715] px-3 rounded"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-xl font-medium text-[#E9E7DF] truncate">
                          {title}
                        </p>
                        {desc && (
                          <p className="mt-0.5 text-xs text-[#A9AEA7] truncate">{desc}</p>
                        )}
                      </div>
                      <span className="font-mono text-xs text-[#8D968F] tabular-nums shrink-0">
                        {arc.files.length}{' '}
                        {lang === 'en'
                          ? arc.files.length === 1
                            ? 'file'
                            : 'files'
                          : 'dosya'}{' '}
                        · {arc.viewCount}{' '}
                        {lang === 'en' && arc.viewCount === 1 ? 'View' : t.explorer.views}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
