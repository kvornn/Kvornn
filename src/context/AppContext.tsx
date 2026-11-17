import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../lib/api';
import { testFirestoreConnection } from '../lib/firebase';
import { detectBrowserLanguage, TRANSLATIONS, TranslationBundle } from '../shared/i18n';
import {
  AccessKeyType,
  AccountStatus,
  AdminProfile,
  CustomRoleBadgeDTO,
  Language,
  UserRank,
} from '../shared/types';

export interface ClientUser {
  id: string;
  username: string;
  avatarUrl: string;
  rank: UserRank;
  adminProfile: AdminProfile | null;
  keyType: AccessKeyType;
  customRoles: CustomRoleBadgeDTO[];
  status: AccountStatus;
  preferredLang: Language;
  mfaEnabled: boolean;
  sessionId: string;
}

export interface BanBannerInfo {
  status: AccountStatus;
  reason: string;
  expiresAt: string | null;
}

interface AppContextValue {
  user: ClientUser | null;
  loading: boolean;
  banInfo: BanBannerInfo | null;
  setBanInfo: (ban: BanBannerInfo | null) => void;
  lang: Language;
  t: TranslationBundle;
  setLang: (nextLang: Language) => Promise<void>;
  currentPath: string;
  currentSearch: string;
  navigate: (to: string) => void;
  refreshUser: () => Promise<void>;
  setUser: (u: ClientUser | null) => void;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const LANG_STORAGE_KEY = 'sentarika_lang';

function parseLocationParts(urlOrPath: string): { pathname: string; search: string } {
  const idx = urlOrPath.indexOf('?');
  if (idx === -1) {
    return { pathname: urlOrPath || '/', search: '' };
  }
  return {
    pathname: urlOrPath.slice(0, idx) || '/',
    search: urlOrPath.slice(idx),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [banInfo, setBanInfo] = useState<BanBannerInfo | null>(null);
  const [locationState, setLocationState] = useState<{ pathname: string; search: string }>(() => ({
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
  }));
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'tr' || saved === 'en') return saved;
    return detectBrowserLanguage(navigator.language);
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    const onPopState = () => {
      setLocationState({
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = parseLocationParts(to);
    const currentFull = `${window.location.pathname || '/'}${window.location.search || ''}`;
    const nextFull = `${next.pathname}${next.search}`;
    if (nextFull === currentFull) return;
    window.history.pushState({}, '', nextFull);
    setLocationState(next);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiRequest<{ authenticated: boolean; user: ClientUser | null }>('/api/auth/me');
      if (res.authenticated && res.user) {
        setUser(res.user);
        setBanInfo(null);
        const saved = localStorage.getItem(LANG_STORAGE_KEY);
        if (!saved && (res.user.preferredLang === 'tr' || res.user.preferredLang === 'en')) {
          setLangState(res.user.preferredLang);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_BANNED' && err.ban) {
        setBanInfo(err.ban);
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void testFirestoreConnection();
    void refreshUser();
  }, [refreshUser]);

  const setLang = useCallback(
    async (nextLang: Language) => {
      setLangState(nextLang);
      localStorage.setItem(LANG_STORAGE_KEY, nextLang);
      if (user) {
        try {
          await apiRequest('/api/auth/preferences', {
            method: 'PATCH',
            body: JSON.stringify({ preferredLang: nextLang }),
          });
          setUser((prev) => (prev ? { ...prev, preferredLang: nextLang } : null));
        } catch {
          // Local preference persists
        }
      }
    },
    [user]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    navigate('/');
  }, [navigate]);

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        banInfo,
        setBanInfo,
        lang,
        t: TRANSLATIONS[lang],
        setLang,
        currentPath: locationState.pathname,
        currentSearch: locationState.search,
        navigate,
        refreshUser,
        setUser,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
