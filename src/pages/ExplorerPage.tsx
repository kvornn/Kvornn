import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, ApiError } from '../lib/api';
import { ArchiveDTO, CategoryDTO } from '../shared/types';
import { resolveLocalizedText } from '../shared/i18n';
import { ArchiveCard, CategoryCard, ResilientImage } from '../components/CategoryVisuals';

interface ExplorerResponse {
  categories: CategoryDTO[];
  archives: ArchiveDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function ExplorerPage() {
  const { user, lang, t, navigate, currentSearch } = useApp();

  const initialParams = new URLSearchParams(currentSearch);
  const [searchInput, setSearchInput] = useState(() => initialParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(() => initialParams.get('category') || '');
  const [selectedSubcategory, setSelectedSubcategory] = useState(() => initialParams.get('subcategory') || '');
  const [selectedTag, setSelectedTag] = useState(() => initialParams.get('tag') || '');
  const [featuredOnly, setFeaturedOnly] = useState(() => initialParams.get('featured') === '1');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExplorerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sync URL query params if navigated from LandingPage or Footer or Tag links
  useEffect(() => {
    const p = new URLSearchParams(currentSearch);
    setSearchInput(p.get('q') || '');
    setSelectedCategory(p.get('category') || '');
    setSelectedSubcategory(p.get('subcategory') || '');
    setSelectedTag(p.get('tag') || '');
    setFeaturedOnly(p.get('featured') === '1');
    setPage(1);
  }, [currentSearch]);

  const loadExplorer = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchInput.trim()) params.set('q', searchInput.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedSubcategory) params.set('subcategory', selectedSubcategory);
      if (selectedTag) params.set('tag', selectedTag);
      if (featuredOnly) params.set('featured', '1');
      params.set('page', String(page));
      params.set('limit', '18');
      const res = await apiRequest<ExplorerResponse>(`/api/explorer?${params.toString()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load archive explorer');
      }
    } finally {
      setLoading(false);
    }
  }, [searchInput, selectedCategory, selectedSubcategory, selectedTag, featuredOnly, page]);

  useEffect(() => {
    void loadExplorer();
  }, [loadExplorer]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void loadExplorer();
  };

  const topCategories = (data?.categories || []).filter((c) => !c.parentId);
  const subcategories = (data?.categories || []).filter((c) =>
    Boolean(c.parentId) && (!selectedCategory || c.parentId === selectedCategory)
  );

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-10">
      <div className="flex flex-col gap-6 border-b border-[#1D2823] pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold text-[#E9E7DF]">
            {t.explorer.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#A9AEA7]">{t.explorer.subtitle}</p>
          {!user && (
            <p className="mt-2 text-xs text-[#8D968F]">
              {t.explorer.signInToExploreNote}{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="font-medium text-[#B89B63] hover:underline"
              >
                {t.nav.login}
              </button>
            </p>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex w-full max-w-md items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8D968F]" />
            <input
              type="search"
              aria-label={t.explorer.searchPlaceholder}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder={t.explorer.searchPlaceholder}
              className="w-full rounded-md border border-[#26352E] bg-[#101715] py-2.5 pl-10 pr-4 text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-[#B89B63] px-4 py-2.5 text-xs font-semibold text-[#090D0C] hover:bg-[#C9AD75]"
          >
            {t.landing.searchAction}
          </button>
        </form>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-3 text-sm text-[#F3D1CE]"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-lg border border-[#223029] bg-[#101715]" />
          ))}
        </div>
      ) : data && data.categories.length === 0 ? (
        <section className="mt-12 grid grid-cols-1 items-center gap-8 overflow-hidden rounded-xl border border-[#223029] bg-[#101715] lg:grid-cols-12">
          <div className="lg:col-span-5 h-64 lg:h-full">
            <ResilientImage
              src="/src/assets/images/sentarika_empty_archive_1794771823840.jpg"
              alt="Empty Vault"
              fallbackTitle="SENTARIKA"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="p-8 lg:col-span-7 lg:p-12">
            <h2 className="font-display text-3xl font-semibold text-[#E9E7DF]">
              {t.explorer.noCategoriesTitle}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#A9AEA7]">
              {t.explorer.noCategoriesDesc}
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* Category Filter Strip */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('');
                setSelectedSubcategory('');
                setPage(1);
              }}
              className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === ''
                  ? 'bg-[#B89B63] text-[#090D0C]'
                  : 'border border-[#24322B] bg-[#101715] text-[#A9AEA7] hover:text-[#E9E7DF]'
              }`}
            >
              {t.explorer.allCategories}
            </button>
            {topCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setSelectedSubcategory('');
                  setPage(1);
                }}
                className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-[#B89B63] text-[#090D0C]'
                    : 'border border-[#24322B] bg-[#101715] text-[#A9AEA7] hover:text-[#E9E7DF]'
                }`}
              >
                {resolveLocalizedText(cat.nameTr, cat.nameEn, lang)}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setFeaturedOnly((v) => !v);
                setPage(1);
              }}
              className={`ml-auto rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                featuredOnly
                  ? 'bg-[#557B67] text-[#E9E7DF]'
                  : 'border border-[#24322B] bg-[#101715] text-[#A9AEA7] hover:text-[#E9E7DF]'
              }`}
            >
              {t.explorer.featuredBadge}
            </button>
          </div>

          {/* Cascading Subcategory Filter */}
          {subcategories.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#8D968F]">{t.nav.subcategories}:</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedSubcategory('');
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 transition-colors ${
                  selectedSubcategory === ''
                    ? 'bg-[#1F2C26] text-[#E9E7DF]'
                    : 'text-[#8D968F] hover:text-[#E9E7DF]'
                }`}
              >
                {t.explorer.allSubcategories}
              </button>
              {subcategories.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    setSelectedSubcategory(sc.id);
                    setPage(1);
                  }}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    selectedSubcategory === sc.id
                      ? 'bg-[#1F2C26] text-[#B89B63]'
                      : 'text-[#8D968F] hover:text-[#E9E7DF]'
                  }`}
                >
                  {resolveLocalizedText(sc.nameTr, sc.nameEn, lang)}
                </button>
              ))}
            </div>
          )}

          {selectedTag && (
            <div className="mt-4 flex items-center gap-3 text-xs text-[#A9AEA7]">
              <span>
                Filter tag: <strong className="text-[#B89B63]">#{selectedTag}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedTag('')}
                className="underline hover:text-[#E9E7DF]"
              >
                {t.common.close}
              </button>
            </div>
          )}

          {/* Top Categories Showcase when unfiltered */}
          {!selectedCategory && !selectedSubcategory && !searchInput && !featuredOnly && !selectedTag && (
            <section className="mt-10">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {topCategories.map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    onSelect={(slug) => navigate(`/category/${slug}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Archives Editorial Grid */}
          <section className="mt-12">
            {data && data.archives.length === 0 ? (
              <div className="rounded-lg border border-[#223029] bg-[#101715] p-10 text-center">
                <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
                  {t.explorer.noResultsTitle}
                </h2>
                <p className="mt-2 text-sm text-[#A9AEA7]">{t.explorer.noResultsDesc}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {data?.archives.map((arc) => (
                  <ArchiveCard
                    key={arc.id}
                    archive={arc}
                    onSelect={(slug) => navigate(`/archive/${slug}`)}
                    onTagClick={(tag) => {
                      setSelectedTag(tag);
                      setPage(1);
                    }}
                  />
                ))}
              </div>
            )}

            {data && data.pagination.totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-[#24322B] bg-[#101715] px-4 py-2 text-xs font-medium text-[#E9E7DF] disabled:opacity-40"
                >
                  ←
                </button>
                <span className="font-mono text-xs text-[#A9AEA7] tabular-nums">
                  {page} / {data.pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-[#24322B] bg-[#101715] px-4 py-2 text-xs font-medium text-[#E9E7DF] disabled:opacity-40"
                >
                  →
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
