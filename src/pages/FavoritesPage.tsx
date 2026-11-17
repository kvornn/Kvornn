import React, { useEffect, useState } from 'react';
import { BookmarkMinus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { ArchiveDTO } from '../shared/types';
import { resolveLocalizedText } from '../shared/i18n';
import { ResilientImage } from '../components/CategoryVisuals';

export function FavoritesPage() {
  const { lang, t, navigate } = useApp();
  const [items, setItems] = useState<ArchiveDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ favorites: ArchiveDTO[] }>('/api/favorites')
      .then((res) => setItems(res.favorites))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const removeFavorite = async (archiveId: string) => {
    try {
      await apiRequest(`/api/favorites/${archiveId}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((a) => a.id !== archiveId));
    } catch {
      // ignore
    }
  };

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-10">
      <div className="border-b border-[#1D2823] pb-6">
        <h1 className="font-display text-4xl font-semibold text-[#E9E7DF]">
          {t.favorites.title}
        </h1>
        <p className="mt-2 text-sm text-[#A9AEA7]">{t.favorites.subtitle}</p>
      </div>

      {loading ? (
        <div className="mt-8 h-40 animate-pulse rounded-lg border border-[#223029] bg-[#101715]" />
      ) : items.length === 0 ? (
        <section className="mt-10 grid grid-cols-1 items-center gap-8 overflow-hidden rounded-xl border border-[#223029] bg-[#101715] lg:grid-cols-12">
          <div className="lg:col-span-5 h-56 lg:h-full">
            <ResilientImage
              src="/src/assets/images/sentarika_empty_archive_1794771823840.jpg"
              alt="Empty Favorites"
              fallbackTitle="SENTARIKA"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="p-8 lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {t.favorites.emptyTitle}
            </h2>
            <p className="mt-2 text-sm text-[#A9AEA7]">{t.favorites.emptyDesc}</p>
            <button
              type="button"
              onClick={() => navigate('/explorer')}
              className="mt-6 rounded-md bg-[#B89B63] px-5 py-2.5 text-xs font-semibold text-[#090D0C]"
            >
              {t.nav.explorer}
            </button>
          </div>
        </section>
      ) : (
        <div className="mt-8 divide-y divide-[#1D2823] border-y border-[#1D2823]">
          {items.map((arc) => {
            const title = resolveLocalizedText(arc.titleTr, arc.titleEn, lang);
            const desc = resolveLocalizedText(arc.shortDescTr, arc.shortDescEn, lang);
            return (
              <div
                key={arc.id}
                className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/archive/${arc.slug}`)}
                    className="font-display text-2xl font-semibold text-[#E9E7DF] hover:text-[#B89B63] text-left"
                  >
                    {title}
                  </button>
                  {desc && <p className="mt-1 text-sm text-[#A9AEA7]">{desc}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void removeFavorite(arc.id)}
                  className="inline-flex items-center gap-2 rounded-md border border-[#2B3932] bg-[#101715] px-4 py-2 text-xs text-[#C8CEC7] hover:border-[#9E3B33] hover:text-[#F3D1CE] shrink-0"
                >
                  <BookmarkMinus className="h-3.5 w-3.5" />
                  <span>{t.archiveDetail.removeFavorite}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
