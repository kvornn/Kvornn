import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function Navbar() {
  const { user, lang, setLang, t, currentPath, navigate, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = user
    ? [
        { label: t.nav.overview, path: '/dashboard' },
        { label: t.nav.explorer, path: '/explorer' },
        { label: t.nav.categories, path: '/categories' },
        { label: t.nav.favorites, path: '/favorites' },
        { label: t.nav.profile, path: '/profile' },
        { label: t.nav.security, path: '/security' },
      ]
    : [
        { label: t.nav.home, path: '/' },
        { label: t.nav.explorer, path: '/explorer' },
        { label: t.nav.categories, path: '/categories' },
        { label: t.nav.editorialPrinciples, path: '/editorial-principles' },
        { label: t.nav.login, path: '/login' },
      ];

  const handleNav = (path: string) => {
    setMobileOpen(false);
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#212D27] bg-[#090D0C]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3 px-4 py-3 sm:gap-8 sm:px-6 sm:py-3.5">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            handleNav('/');
          }}
          className="font-display text-base sm:text-xl font-semibold tracking-[0.08em] sm:tracking-[0.14em] text-[#E9E7DF] transition-colors hover:text-[#B89B63] whitespace-nowrap shrink-0"
        >
          SENTARIKA ARCHIVE
        </a>

        <nav className="hidden lg:flex items-center gap-6" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active =
              currentPath === item.path ||
              (item.path === '/explorer' &&
                (currentPath.startsWith('/search') || currentPath.startsWith('/archive/'))) ||
              (item.path === '/categories' &&
                (currentPath === '/subcategories' || currentPath.startsWith('/category/')));
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.path);
                }}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b pb-0.5 ${
                  active
                    ? 'border-[#B89B63] text-[#E9E7DF]'
                    : 'border-transparent text-[#A9AEA7] hover:text-[#E9E7DF]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
          {user?.rank === 'ADMIN' && (
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                handleNav('/admin');
              }}
              className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b pb-0.5 ${
                currentPath.startsWith('/admin')
                  ? 'border-[#B89B63] text-[#B89B63]'
                  : 'border-transparent text-[#B89B63]/85 hover:text-[#B89B63]'
              }`}
            >
              {t.nav.admin}
            </a>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div
            className="flex items-center rounded-md border border-[#24322B] bg-[#101715] p-0.5"
            role="group"
            aria-label="Language switcher"
          >
            <button
              type="button"
              onClick={() => void setLang('tr')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                lang === 'tr'
                  ? 'bg-[#B89B63] text-[#090D0C]'
                  : 'text-[#A9AEA7] hover:text-[#E9E7DF]'
              }`}
            >
              TR
            </button>
            <button
              type="button"
              onClick={() => void setLang('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                lang === 'en'
                  ? 'bg-[#B89B63] text-[#090D0C]'
                  : 'text-[#A9AEA7] hover:text-[#E9E7DF]'
              }`}
            >
              EN
            </button>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="hidden sm:inline-flex items-center justify-center rounded-md border border-[#2C3A33] bg-[#151E1A] px-4 py-2 text-xs font-semibold text-[#E9E7DF] transition-colors hover:border-[#B89B63] hover:text-[#B89B63] whitespace-nowrap shrink-0"
            >
              {t.nav.logout}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleNav('/register')}
              className="hidden sm:inline-flex items-center justify-center rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C] transition-colors hover:bg-[#C9AD75] whitespace-nowrap shrink-0"
            >
              {t.nav.register}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#24322B] bg-[#101715] text-[#E9E7DF] lg:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#212D27] bg-[#101715] px-6 py-4 lg:hidden">
          <div className="flex flex-col gap-1.5">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.path);
                }}
                className="flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium text-[#E9E7DF] hover:bg-[#151E1A]"
              >
                {item.label}
              </a>
            ))}
            {user?.rank === 'ADMIN' && (
              <a
                href="/admin"
                onClick={(e) => {
                  e.preventDefault();
                  handleNav('/admin');
                }}
                className="flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium text-[#B89B63] hover:bg-[#151E1A]"
              >
                {t.nav.admin}
              </a>
            )}
            <div className="pt-2 border-t border-[#212D27]">
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void logout();
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-md border border-[#2C3A33] bg-[#151E1A] text-sm font-medium text-[#E9E7DF]"
                >
                  {t.nav.logout}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNav('/register')}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-md bg-[#B89B63] text-sm font-semibold text-[#090D0C]"
                >
                  {t.nav.register}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
