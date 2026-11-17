import React from 'react';
import { useApp } from '../context/AppContext';

export function EditorialFooter() {
  const { t, navigate } = useApp();

  return (
    <footer className="border-t border-[#1D2823] bg-[#090D0C] py-10">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-6 text-xs text-[#8D968F] md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-sm tracking-[0.12em] text-[#E9E7DF]">
            {t.brand}
          </p>
          <p className="mt-1 text-[#8D968F]">{t.landing.footerNote}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <button
            type="button"
            onClick={() => navigate('/explorer')}
            className="hover:text-[#E9E7DF] transition-colors"
          >
            {t.nav.explorer}
          </button>
          <button
            type="button"
            onClick={() => navigate('/categories')}
            className="hover:text-[#E9E7DF] transition-colors"
          >
            {t.nav.categories}
          </button>
          <button
            type="button"
            onClick={() => navigate('/subcategories')}
            className="hover:text-[#E9E7DF] transition-colors"
          >
            {t.nav.subcategories}
          </button>
          <button
            type="button"
            onClick={() => navigate('/about')}
            className="hover:text-[#E9E7DF] transition-colors"
          >
            {t.legal.aboutLink}
          </button>
          <button
            type="button"
            onClick={() => navigate('/editorial-principles')}
            className="hover:text-[#E9E7DF] transition-colors"
          >
            {t.legal.principlesLink}
          </button>
          <button
            type="button"
            onClick={() => navigate('/terms')}
            className="hover:text-[#E9E7DF] transition-colors"
          >
            {t.legal.termsLink}
          </button>
          <button
            type="button"
            onClick={() => navigate('/privacy')}
            className="hover:text-[#E9E7DF] transition-colors"
          >
            {t.legal.privacyLink}
          </button>
          <span className="font-mono text-[#B89B63]">{t.slogan}</span>
        </div>
      </div>
    </footer>
  );
}
