import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, KeyRound, Lock, Scale, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { ArchiveDTO, CategoryDTO } from '../shared/types';
import { ArchiveCard, CategoryCard, ResilientImage } from '../components/CategoryVisuals';

interface PublicOverview {
  categoriesCount: number;
  subcategoriesCount?: number;
  archivesCount: number;
}

interface PublicCatalog {
  categories: CategoryDTO[];
  subcategories: CategoryDTO[];
  featuredArchives: ArchiveDTO[];
  recentArchives: ArchiveDTO[];
  tags: string[];
}

export function LandingPage() {
  const { user, lang, t, navigate } = useApp();
  const [overview, setOverview] = useState<PublicOverview>({
    categoriesCount: 0,
    subcategoriesCount: 0,
    archivesCount: 0,
  });
  const [catalog, setCatalog] = useState<PublicCatalog>({
    categories: [],
    subcategories: [],
    featuredArchives: [],
    recentArchives: [],
    tags: [],
  });
  const [heroSearch, setHeroSearch] = useState('');

  useEffect(() => {
    apiRequest<PublicOverview>('/api/public/overview')
      .then((res) => setOverview(res))
      .catch(() => {});
    apiRequest<PublicCatalog>('/api/public/catalog')
      .then((res) => setCatalog(res))
      .catch(() => {});
  }, []);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = heroSearch.trim();
    navigate(q ? `/explorer?q=${encodeURIComponent(q)}` : '/explorer');
  };

  const hasPublishedContent =
    catalog.categories.length > 0 ||
    catalog.featuredArchives.length > 0 ||
    catalog.recentArchives.length > 0;

  return (
    <main className="min-h-screen bg-[#090D0C]">
      {/* Hero Section with Prominent Search */}
      <section className="mx-auto max-w-[1360px] px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
          <div className="flex flex-col justify-between py-2 lg:col-span-6">
            <div>
              <p className="font-mono text-xs font-medium tracking-[0.22em] text-[#B89B63]">
                {t.landing.heroTagline}
              </p>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.06] text-[#E9E7DF] sm:text-5xl lg:text-6xl text-balance">
                {t.landing.heroTitle}
              </h1>
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-[#557B67]">
                {t.slogan}
              </p>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#C2C7C0]">
                {t.landing.heroSubtitle}
              </p>

              {/* Prominent Public Search Input */}
              <form
                onSubmit={handleHeroSearch}
                className="mt-8 flex max-w-xl flex-col gap-2.5 sm:flex-row"
              >
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8D968F]" />
                  <input
                    type="search"
                    aria-label={t.landing.searchPlaceholder}
                    value={heroSearch}
                    onChange={(e) => setHeroSearch(e.target.value)}
                    placeholder={t.landing.searchPlaceholder}
                    className="w-full rounded-md border border-[#26352E] bg-[#101715] py-3 pl-10 pr-4 text-sm text-[#E9E7DF] placeholder-[#7C867E] focus:border-[#B89B63] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#B89B63] px-5 py-3 text-xs font-semibold text-[#090D0C] transition-colors hover:bg-[#C9AD75] whitespace-nowrap shrink-0"
                >
                  <span>{t.landing.searchAction}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {user ? (
                <button
                  type="button"
                  onClick={() => navigate('/explorer')}
                  className="inline-flex items-center gap-2.5 rounded-md border border-[#2B3932] bg-[#101715] px-5 py-3 text-xs font-semibold text-[#E9E7DF] transition-colors hover:border-[#B89B63] hover:text-[#B89B63] whitespace-nowrap shrink-0"
                >
                  <span>{t.landing.exploreCta}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => navigate('/register')}
                    className="inline-flex items-center gap-2.5 rounded-md border border-[#B89B63]/60 bg-[#141D19] px-5 py-3 text-xs font-semibold text-[#E9E7DF] transition-colors hover:bg-[#B89B63] hover:text-[#090D0C] whitespace-nowrap shrink-0"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>{t.landing.primaryCta}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-2 rounded-md border border-[#2B3932] bg-[#101715] px-5 py-3 text-xs font-medium text-[#E9E7DF] transition-colors hover:border-[#B89B63]/60 whitespace-nowrap shrink-0"
                  >
                    <span>{t.landing.secondaryCta}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => navigate('/editorial-principles')}
                className="inline-flex items-center gap-1.5 px-2 py-2 text-xs font-medium text-[#A9AEA7] transition-colors hover:text-[#B89B63]"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{t.landing.aboutCta}</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-[320px] sm:h-[400px] lg:h-full min-h-[380px] overflow-hidden rounded-lg border border-[#223029] bg-[#101715]">
              <ResilientImage
                src="/src/assets/images/sentarika_vault_hero_1794771822197.jpg"
                alt="Sentarika Digital Archive Vault"
                fallbackTitle="SENTARIKA ARCHIVE"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#090D0C]/90 via-[#090D0C]/20 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4 border-t border-[#E9E7DF]/15 pt-4">
                <div>
                  <p className="font-display text-lg text-[#E9E7DF]">{t.slogan}</p>
                  <p className="mt-1 text-xs text-[#A9AEA7]">
                    {overview.categoriesCount === 0
                      ? t.landing.statusVaultEmpty
                      : `${overview.categoriesCount} ${t.landing.statusCategories} · ${overview.archivesCount} ${t.landing.statusArchives}`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width Repository State Strip */}
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[#223029] bg-[#223029] sm:grid-cols-3">
          <div className="bg-[#101715] px-6 py-5">
            <p className="text-xs font-medium text-[#8D968F]">{t.landing.statusCategories}</p>
            <p className="mt-1.5 font-mono text-2xl font-medium text-[#E9E7DF] tabular-nums">
              {overview.categoriesCount}
            </p>
          </div>
          <div className="bg-[#101715] px-6 py-5">
            <p className="text-xs font-medium text-[#8D968F]">{t.landing.statusArchives}</p>
            <p className="mt-1.5 font-mono text-2xl font-medium text-[#E9E7DF] tabular-nums">
              {overview.archivesCount}
            </p>
          </div>
          <div className="bg-[#101715] px-6 py-5">
            <p className="text-xs font-medium text-[#8D968F]">{t.landing.statusTitle}</p>
            <p className="mt-1.5 text-sm font-medium text-[#557B67]">
              CSPRNG 30-Key · HMAC · Zero-Trust
            </p>
          </div>
        </div>
      </section>

      {/* Dynamic Public Catalog Sections (Truthfully Empty When 0 Items) */}
      <section className="border-t border-[#1D2823] bg-[#0B100E] py-16">
        <div className="mx-auto max-w-[1360px] px-6 space-y-14">
          {!hasPublishedContent ? (
            <div className="grid grid-cols-1 items-center gap-8 overflow-hidden rounded-xl border border-[#223029] bg-[#101715] lg:grid-cols-12">
              <div className="h-56 lg:col-span-5 lg:h-full">
                <ResilientImage
                  src="/src/assets/images/sentarika_empty_archive_1794771823840.jpg"
                  alt="Empty Archive Vault"
                  fallbackTitle="SENTARIKA"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-8 lg:col-span-7 lg:p-10">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#B89B63]">
                  {lang === 'tr' ? 'DİNAMİK KÜRASYON' : 'DYNAMIC CURATION'}
                </p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-[#E9E7DF]">
                  {t.dashboard.emptyVaultTitle}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#A9AEA7]">
                  {t.landing.emptyCatalogNote}
                </p>
              </div>
            </div>
          ) : (
            <>
              {catalog.featuredArchives.length > 0 && (
                <div>
                  <div className="flex items-end justify-between border-b border-[#1D2823] pb-3">
                    <h2 className="font-display text-3xl font-semibold text-[#E9E7DF]">
                      {t.landing.featuredTitle}
                    </h2>
                    <button
                      type="button"
                      onClick={() => navigate('/explorer?featured=1')}
                      className="text-xs font-medium text-[#B89B63] hover:underline"
                    >
                      {t.landing.viewAllArchives} →
                    </button>
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {catalog.featuredArchives.map((arc) => (
                      <ArchiveCard
                        key={arc.id}
                        archive={arc}
                        onSelect={(slug) => navigate(`/archive/${slug}`)}
                        onTagClick={(tag) => navigate(`/explorer?tag=${encodeURIComponent(tag)}`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {catalog.recentArchives.length > 0 && (
                <div>
                  <div className="flex items-end justify-between border-b border-[#1D2823] pb-3">
                    <h2 className="font-display text-3xl font-semibold text-[#E9E7DF]">
                      {t.landing.recentTitle}
                    </h2>
                    <button
                      type="button"
                      onClick={() => navigate('/explorer')}
                      className="text-xs font-medium text-[#B89B63] hover:underline"
                    >
                      {t.landing.viewAllArchives} →
                    </button>
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {catalog.recentArchives.slice(0, 6).map((arc) => (
                      <ArchiveCard
                        key={arc.id}
                        archive={arc}
                        onSelect={(slug) => navigate(`/archive/${slug}`)}
                        onTagClick={(tag) => navigate(`/explorer?tag=${encodeURIComponent(tag)}`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {catalog.categories.length > 0 && (
                <div>
                  <div className="flex items-end justify-between border-b border-[#1D2823] pb-3">
                    <h2 className="font-display text-3xl font-semibold text-[#E9E7DF]">
                      {t.landing.categoriesTitle}
                    </h2>
                    <button
                      type="button"
                      onClick={() => navigate('/categories')}
                      className="text-xs font-medium text-[#B89B63] hover:underline"
                    >
                      {t.landing.viewAllCategories} →
                    </button>
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {catalog.categories.slice(0, 6).map((cat) => (
                      <CategoryCard
                        key={cat.id}
                        category={cat}
                        onSelect={(slug) => navigate(`/category/${slug}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Core Philosophy Manifesto */}
      <section className="border-t border-[#1D2823] bg-[#090D0C] py-16">
        <div className="mx-auto max-w-[1360px] px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#B89B63]">
                {t.landing.heroTagline}
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-[#E9E7DF]">
                {t.landing.philosophyTitle}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#A9AEA7]">
                {t.landing.philosophySubtitle}
              </p>
            </div>
            <div className="lg:col-span-8">
              <ol className="divide-y divide-[#1D2823] border-y border-[#1D2823]">
                {t.landing.axioms.map((axiom, index) => (
                  <li key={axiom} className="flex items-baseline gap-6 py-4">
                    <span className="font-mono text-xs font-medium text-[#B89B63] tabular-nums shrink-0">
                      0{index + 1}
                    </span>
                    <span className="font-display text-lg sm:text-xl text-[#E9E7DF]">
                      {axiom}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Foundational Principles & Neutrality */}
      <section className="border-t border-[#1D2823] bg-[#0D1311] py-16">
        <div className="mx-auto max-w-[1360px] px-6">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-lg border border-[#223029] bg-[#101715]">
                <ResilientImage
                  src="/src/assets/images/sentarika_security_chamber_1794771825271.jpg"
                  alt="Sentarika Conservation Vault Mechanism"
                  fallbackTitle="SENTARIKA SECURITY"
                  className="aspect-video w-full object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7">
              <h2 className="font-display text-3xl font-semibold text-[#E9E7DF]">
                {t.landing.principlesTitle}
              </h2>
              <div className="mt-8 divide-y divide-[#1D2823] border-y border-[#1D2823]">
                <div className="flex items-start gap-4 py-6">
                  <Scale className="mt-1 h-5 w-5 shrink-0 text-[#B89B63]" />
                  <div>
                    <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
                      {t.landing.principle1Title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#A9AEA7]">
                      {t.landing.principle1Body}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 py-6">
                  <Lock className="mt-1 h-5 w-5 shrink-0 text-[#557B67]" />
                  <div>
                    <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
                      {t.landing.principle2Title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#A9AEA7]">
                      {t.landing.principle2Body}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 py-6">
                  <KeyRound className="mt-1 h-5 w-5 shrink-0 text-[#B89B63]" />
                  <div>
                    <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
                      {t.landing.principle3Title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#A9AEA7]">
                      {t.landing.principle3Body}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
