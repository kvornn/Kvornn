import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, ApiError } from '../lib/api';
import { ArchiveDTO, CategoryDTO } from '../shared/types';
import { resolveLocalizedText } from '../shared/i18n';
import { CategoryCard, CategoryIcon, ResilientImage } from '../components/CategoryVisuals';

interface CategoryViewResponse {
  category: CategoryDTO;
  subcategories: CategoryDTO[];
  archives: ArchiveDTO[];
}

export function CategoryViewPage({ slug }: { slug: string }) {
  const { lang, t, navigate } = useApp();
  const [data, setData] = useState<CategoryViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDenied(false);
    apiRequest<CategoryViewResponse>(`/api/categories/${encodeURIComponent(slug)}`)
      .then((res) => setData(res))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setDenied(true);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <main className="mx-auto max-w-[1360px] px-6 py-12">
        <div className="h-48 animate-pulse rounded-lg border border-[#223029] bg-[#101715]" />
      </main>
    );
  }

  if (denied) {
    return (
      <main className="mx-auto max-w-[780px] px-6 py-20 text-center">
        <p className="font-mono text-xs text-[#B89B63]">{t.accessDenied.code}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[#E9E7DF]">
          {t.accessDenied.title}
        </h1>
        <p className="mt-3 text-sm text-[#A9AEA7]">{t.accessDenied.subtitle}</p>
        <button
          type="button"
          onClick={() => navigate('/explorer')}
          className="mt-8 rounded-md bg-[#B89B63] px-5 py-2.5 text-xs font-semibold text-[#090D0C]"
        >
          {t.archiveDetail.backToExplorer}
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-[780px] px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-[#E9E7DF]">404</h1>
        <button
          type="button"
          onClick={() => navigate('/explorer')}
          className="mt-6 rounded-md border border-[#26352E] px-5 py-2 text-xs text-[#E9E7DF]"
        >
          {t.archiveDetail.backToExplorer}
        </button>
      </main>
    );
  }

  const { category, subcategories, archives } = data;
  const title = resolveLocalizedText(category.nameTr, category.nameEn, lang);
  const desc = resolveLocalizedText(category.descriptionTr, category.descriptionEn, lang);

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-10">
      <button
        type="button"
        onClick={() => navigate('/explorer')}
        className="inline-flex items-center gap-2 text-xs font-medium text-[#A9AEA7] hover:text-[#E9E7DF]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{t.archiveDetail.backToExplorer}</span>
      </button>

      {/* Editorial Category Header */}
      <section className="mt-6 overflow-hidden rounded-xl border border-[#223029] bg-[#101715]">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="p-8 lg:col-span-7 lg:p-12">
            <div className="flex items-center gap-3">
              <CategoryIcon name={category.icon} color={category.accentColor || '#B89B63'} />
              <span className="font-mono text-xs text-[#8D968F] tabular-nums">
                /{category.slug} · {archives.length}{' '}
                {lang === 'en' && archives.length === 1 ? 'Archive' : t.explorer.itemsCount}
              </span>
            </div>
            <h1 className="mt-4 font-display text-4xl font-semibold text-[#E9E7DF] sm:text-5xl">
              {title}
            </h1>
            {desc && (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#B6BCB5]">{desc}</p>
            )}
          </div>
          {category.coverImageUrl && (
            <div className="lg:col-span-5 h-56 lg:h-auto border-t lg:border-t-0 lg:border-l border-[#223029]">
              <ResilientImage
                src={category.coverImageUrl}
                alt={title}
                fallbackTitle={title}
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {subcategories.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-[#E9E7DF]">
            {t.nav.subcategories}
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {subcategories.map((sc) => (
              <CategoryCard
                key={sc.id}
                category={sc}
                variant="compact"
                onSelect={(s) => navigate(`/category/${s}`)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        {archives.length === 0 ? (
          <div className="grid grid-cols-1 items-center gap-8 overflow-hidden rounded-xl border border-[#223029] bg-[#101715] lg:grid-cols-12">
            <div className="lg:col-span-5 h-56 lg:h-full">
              <ResilientImage
                src="/src/assets/images/sentarika_empty_archive_1794771823840.jpg"
                alt="Empty Category"
                fallbackTitle={title}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-8 lg:col-span-7">
              <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
                {t.explorer.noResultsTitle}
              </h2>
              <p className="mt-2 text-sm text-[#A9AEA7]">{t.explorer.noResultsDesc}</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#1D2823] border-y border-[#1D2823]">
            {archives.map((arc) => {
              const arcTitle = resolveLocalizedText(arc.titleTr, arc.titleEn, lang);
              const arcDesc = resolveLocalizedText(arc.shortDescTr, arc.shortDescEn, lang);
              return (
                <article
                  key={arc.id}
                  className="grid grid-cols-1 items-center gap-6 py-7 lg:grid-cols-12"
                >
                  <div className="lg:col-span-8">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#8D968F] tabular-nums">
                      {arc.isFeatured && (
                        <>
                          <span className="font-medium text-[#B89B63]">{t.explorer.featuredBadge}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span>{arc.accessLevel}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {arc.viewCount}{' '}
                        {lang === 'en' && arc.viewCount === 1 ? 'View' : t.explorer.views}
                      </span>
                      {arc.files.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {arc.files.length}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="mt-2 font-display text-3xl font-semibold text-[#E9E7DF]">
                      <button
                        type="button"
                        onClick={() => navigate(`/archive/${arc.slug}`)}
                        className="text-left hover:text-[#B89B63] transition-colors"
                      >
                        {arcTitle}
                      </button>
                    </h2>
                    {arcDesc && (
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#A9AEA7]">
                        {arcDesc}
                      </p>
                    )}
                    {arc.sourceInfo && (
                      <p className="mt-1.5 font-mono text-[11px] text-[#8D968F]">{arc.sourceInfo}</p>
                    )}
                  </div>
                  <div className="lg:col-span-4 lg:text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/archive/${arc.slug}`)}
                      className="inline-flex items-center rounded-md border border-[#2B3932] bg-[#101715] px-4 py-2 text-xs font-medium text-[#E9E7DF] hover:border-[#B89B63] hover:text-[#B89B63]"
                    >
                      {arcTitle} →
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
