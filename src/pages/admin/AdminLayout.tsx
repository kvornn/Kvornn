import React, { useEffect, useState } from 'react';
import { Menu, ShieldCheck, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { AccessDeniedPage } from '../StatusPages';
import { AdminOverviewSection } from './AdminOverviewSection';
import { AdminUsersSection } from './AdminUsersSection';
import { AdminCategoriesSection } from './AdminCategoriesSection';
import { AdminSubcategoriesSection } from './AdminSubcategoriesSection';
import { AdminArchivesSection } from './AdminArchivesSection';
import { AdminFilesSection } from './AdminFilesSection';
import { AdminPermissionsSection } from './AdminPermissionsSection';
import { AdminReportsSection } from './AdminReportsSection';
import { AdminSecuritySection } from './AdminSecurityBansSection';
import {
  AdminAuditSection,
  AdminBackupsSection,
  AdminSettingsSection,
} from './AdminGovernanceSection';

export type AdminSectionKey =
  | 'overview'
  | 'users'
  | 'categories'
  | 'subcategories'
  | 'archives'
  | 'files'
  | 'permissions'
  | 'reports'
  | 'security'
  | 'audit'
  | 'backups'
  | 'settings';

const MENU_ORDER: AdminSectionKey[] = [
  'overview',
  'users',
  'categories',
  'subcategories',
  'archives',
  'files',
  'permissions',
  'reports',
  'security',
  'audit',
  'backups',
  'settings',
];

export function AdminLayout() {
  const { user, lang, t, navigate } = useApp();
  const [allowedSections, setAllowedSections] = useState<string[] | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSectionKey>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!user || user.rank !== 'ADMIN' || user.adminProfile !== 'ADMIN') return;
    apiRequest<{ allowedSections: string[] }>('/api/admin/capabilities')
      .then((res) => setAllowedSections(res.allowedSections))
      .catch(() => setAllowedSections([]));
  }, [user]);

  if (!user || user.rank !== 'ADMIN' || user.adminProfile !== 'ADMIN') {
    return <AccessDeniedPage />;
  }

  const visibleMenu = MENU_ORDER.filter(
    (k) => !allowedSections || allowedSections.includes(k)
  );

  const selectSection = (key: AdminSectionKey) => {
    setActiveSection(key);
    setMobileNavOpen(false);
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <AdminOverviewSection onNavigateSection={selectSection} />;
      case 'users':
        return <AdminUsersSection />;
      case 'categories':
        return <AdminCategoriesSection />;
      case 'subcategories':
        return <AdminSubcategoriesSection />;
      case 'archives':
        return <AdminArchivesSection />;
      case 'files':
        return <AdminFilesSection />;
      case 'permissions':
        return <AdminPermissionsSection />;
      case 'reports':
        return <AdminReportsSection />;
      case 'security':
        return <AdminSecuritySection />;
      case 'audit':
        return <AdminAuditSection />;
      case 'backups':
        return <AdminBackupsSection />;
      case 'settings':
        return <AdminSettingsSection />;
      default:
        return <AdminOverviewSection onNavigateSection={selectSection} />;
    }
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#070A09]">
      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* Mobile header bar */}
        <div className="flex items-center justify-between border-b border-[#1D2823] bg-[#0C1210] px-5 py-3 lg:hidden">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[#B89B63]" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#B89B63]">
                {t.adminProfiles.ADMIN}
              </p>
              <p className="text-xs font-medium text-[#E9E7DF]">{t.admin.menu[activeSection]}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label="Toggle admin navigation"
            aria-expanded={mobileNavOpen}
            className="rounded-md border border-[#24322B] bg-[#101715] p-2 text-[#E9E7DF]"
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {/* Sidebar */}
        <aside
          className={`${
            mobileNavOpen ? 'block' : 'hidden'
          } w-full shrink-0 border-b border-[#1D2823] bg-[#0C1210] p-5 lg:block lg:min-h-[calc(100vh-73px)] lg:w-[260px] lg:border-r lg:border-b-0`}
        >
          <div className="mb-6 hidden border-b border-[#1D2823] pb-4 lg:block">
            <p className="font-mono text-[11px] uppercase tracking-widest text-[#B89B63]">
              {t.adminProfiles.ADMIN}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#E9E7DF]">
              {t.admin.title}
            </h1>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Unified admin sections">
            {visibleMenu.map((key) => {
              const active = activeSection === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectSection(key)}
                  className={`rounded-md px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#B89B63] text-[#090D0C]'
                      : 'text-[#A9AEA7] hover:bg-[#141D19] hover:text-[#E9E7DF]'
                  }`}
                >
                  {t.admin.menu[key]}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 border-t border-[#1D2823] pt-4 space-y-2">
            <button
              type="button"
              onClick={() => navigate('/explorer')}
              className="w-full rounded-md border border-[#24322B] bg-[#101715] px-3 py-2 text-left text-xs text-[#C8CEC7] hover:border-[#B89B63]"
            >
              {t.nav.explorer} →
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full rounded-md border border-[#24322B] bg-[#101715] px-3 py-2 text-left text-xs text-[#8D968F] hover:border-[#B89B63] hover:text-[#E9E7DF]"
            >
              {lang === 'tr' ? 'Kamusal Ana Sayfa →' : 'Public Homepage →'}
            </button>
          </div>
        </aside>

        <main className="flex-1 p-5 sm:p-6 lg:p-10">
          <div className="mb-8 border-b border-[#1D2823] pb-4">
            <p className="font-mono text-xs text-[#8D968F]">
              /admin / {t.admin.menu[activeSection]}
            </p>
            <p className="mt-1 text-xs text-[#A9AEA7]">{t.admin.subtitle}</p>
          </div>
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
