import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { CategoryDTO } from '../shared/types';
import { resolveLocalizedText } from '../shared/i18n';
import { CategoryCard, ResilientImage } from '../components/CategoryVisuals';

interface CategoriesListResponse {
  categories: CategoryDTO[];
  subcategories: CategoryDTO[];
}

export function CategoriesPage({ mode = 'categories' }: { mode?: 'categories' | 'subcategories' }) {
  const { lang, t, navigate } = useApp();
  const [data, setData] = useState<CategoriesListResponse>({ categories: [], subcategories: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest<CategoriesListResponse>('/api/categories')
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const parentMap = new Map(data.categories.map((c) => [c.id, c]));

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-10">
      <div className="flex flex-col gap-4 border-b border-[#1D2823] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-[#B89B63]">
            SENTARIKA ARCHIVE
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-[#E9E7DF]">
            {mode === 'subcategories' ? t.nav.subcategories : t.nav.categories}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#A9AEA7]">
            {mode === 'subcategories'
              ? lang === 'tr'
                ? 'Ana arşiv koleksiyonları altında sınıflandırılmış özel alt kategoriler.'
                : 'Specialized archival subdivisions nested beneath primary repository categories.'
              : lang === 'tr'
                ? 'Yönetici tarafından küratörlüğü yapılan tüm erişilebilir arşiv kategorileri.'
                : 'All accessible primary archival categories curated by repository administrators.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/categories')}
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
              mode === 'categories'
                ? 'bg-[#B89B63] text-[#090D0C]'
                : 'border border-[#24322B] bg-[#101715] text-[#A9AEA7] hover:text-[#E9E7DF]'
            }`}
          >
            {t.nav.categories}
          </button>
          <button
            type="button"
            onClick={() => navigate('/subcategories')}
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
              mode === 'subcategories'
                ? 'bg-[#B89B63] text-[#090D0C]'
                : 'border border-[#24322B] bg-[#101715] text-[#A9AEA7] hover:text-[#E9E7DF]'
            }`}
          >
            {t.nav.subcategories}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-lg border border-[#223029] bg-[#101715]" />
          ))}
        </div>
      ) : mode === 'categories' ? (
        data.categories.length === 0 ? (
          <section className="mt-10 grid grid-cols-1 items-center gap-8 overflow-hidden rounded-xl border border-[#223029] bg-[#101715] lg:grid-cols-12">
            <div className="h-56 lg:col-span-5 lg:h-full">
              <ResilientImage
                src="/src/assets/images/sentarika_empty_archive_1794771823840.jpg"
                alt="Empty Repository"
                fallbackTitle="SENTARIKA"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-8 lg:col-span-7">
              <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
                {t.explorer.noCategoriesTitle}
              </h2>
              <p className="mt-2 max-w-lg text-sm text-[#A9AEA7]">
                {t.explorer.noCategoriesDesc}
              </p>
            </div>
          </section>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                onSelect={(slug) => navigate(`/category/${slug}`)}
              />
            ))}
          </div>
        )
      ) : data.subcategories.length === 0 ? (
        <section className="mt-10 rounded-xl border border-[#223029] bg-[#101715] p-10 text-center">
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {t.explorer.noSubcategoriesTitle}
          </h2>
          <p className="mt-2 text-sm text-[#A9AEA7]">{t.explorer.noSubcategoriesDesc}</p>
        </section>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.subcategories.map((sub) => {
            const parent = sub.parentId ? parentMap.get(sub.parentId) : null;
            return (
              <div key={sub.id} className="space-y-2">
                {parent && (
                  <button
                    type="button"
                    onClick={() => navigate(`/category/${parent.slug}`)}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#B89B63] hover:underline"
                  >
                    <span>{resolveLocalizedText(parent.nameTr, parent.nameEn, lang)}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
                <CategoryCard
                  category={sub}
                  variant="compact"
                  onSelect={(slug) => navigate(`/category/${slug}`)}
                />
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
