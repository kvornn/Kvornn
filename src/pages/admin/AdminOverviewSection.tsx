import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import type { AdminSectionKey } from './AdminLayout';

interface OverviewResponse {
  stats: {
    totalUsers: number;
    activeUsers: number;
    uyeCount: number;
    destekciCount: number;
    isletmeCount: number;
    totalCategories: number;
    totalSubcategories: number;
    totalArchives: number;
    totalFiles: number;
    openReports: number;
    pendingActions: number;
  };
  recentSecurityEvents: Array<{
    id: string;
    event_type: string;
    severity: string;
    ip_address: string;
    details: string;
    created_at: string;
  }>;
  recentAuditLogs: Array<{
    id: number;
    actor_username: string;
    action: string;
    summary: string;
    created_at: string;
  }>;
}

export function AdminOverviewSection({
  onNavigateSection,
}: {
  onNavigateSection?: (key: AdminSectionKey) => void;
}) {
  const { lang, t } = useApp();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<OverviewResponse>('/api/admin/overview')
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-lg border border-[#223029] bg-[#101715]" />;
  }

  const stats = data?.stats;
  const statCards: Array<{ label: string; value: number; target?: AdminSectionKey }> = [
    { label: t.admin.stats.totalUsers, value: stats?.totalUsers ?? 0, target: 'users' },
    { label: t.admin.stats.activeUsers, value: stats?.activeUsers ?? 0, target: 'users' },
    { label: t.admin.stats.totalCategories, value: stats?.totalCategories ?? 0, target: 'categories' },
    {
      label: lang === 'tr' ? 'Alt Kategoriler' : 'Subcategories',
      value: stats?.totalSubcategories ?? 0,
      target: 'subcategories',
    },
    { label: t.admin.stats.totalArchives, value: stats?.totalArchives ?? 0, target: 'archives' },
    { label: t.admin.stats.totalFiles, value: stats?.totalFiles ?? 0, target: 'files' },
    { label: t.admin.stats.openReports, value: stats?.openReports ?? 0, target: 'reports' },
    { label: t.admin.stats.pendingActions, value: stats?.pendingActions ?? 0, target: 'reports' },
    { label: t.admin.stats.uyeCount, value: stats?.uyeCount ?? 0, target: 'users' },
    { label: t.admin.stats.destekciCount, value: stats?.destekciCount ?? 0, target: 'users' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#223029] bg-[#223029] sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => c.target && onNavigateSection?.(c.target)}
            className="bg-[#101715] px-5 py-4 text-left transition-colors hover:bg-[#141D19]"
          >
            <p className="text-xs text-[#8D968F]">{c.label}</p>
            <p className="mt-1.5 font-mono text-2xl font-medium text-[#E9E7DF] tabular-nums">
              {c.value}
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="rounded-lg border border-[#223029] bg-[#101715] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {lang === 'tr' ? 'Son Güvenlik Olayları' : 'Recent Security Events'}
            </h2>
            {onNavigateSection && (
              <button
                type="button"
                onClick={() => onNavigateSection('security')}
                className="font-mono text-[11px] text-[#B89B63] hover:underline"
              >
                {t.admin.menu.security} →
              </button>
            )}
          </div>
          {!data?.recentSecurityEvents.length ? (
            <p className="mt-4 text-xs text-[#8D968F]">
              {lang === 'tr' ? 'Henüz güvenlik olayı kaydedilmedi.' : 'No security events recorded yet.'}
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#1D2823]">
              {data.recentSecurityEvents.map((ev) => (
                <div key={ev.id} className="py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[#B89B63]">{ev.event_type}</span>
                    <span className="font-mono text-[#8D968F] tabular-nums">
                      {ev.severity} · {ev.ip_address}
                    </span>
                  </div>
                  <p className="mt-1 text-[#C8CEC7]">{ev.details}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#223029] bg-[#101715] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {lang === 'tr' ? 'Son Yönetici İşlemleri' : 'Recent Administrative Actions'}
            </h2>
            {onNavigateSection && (
              <button
                type="button"
                onClick={() => onNavigateSection('audit')}
                className="font-mono text-[11px] text-[#B89B63] hover:underline"
              >
                {t.admin.menu.audit} →
              </button>
            )}
          </div>
          {!data?.recentAuditLogs.length ? (
            <p className="mt-4 text-xs text-[#8D968F]">
              {lang === 'tr' ? 'Henüz denetim kaydı yok.' : 'No audit entries recorded yet.'}
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#1D2823]">
              {data.recentAuditLogs.map((log) => (
                <div key={log.id} className="py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[#557B67]">{log.action}</span>
                    <span className="font-mono text-[#8D968F] tabular-nums">
                      {new Date(log.created_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                    </span>
                  </div>
                  <p className="mt-1 text-[#E9E7DF]">{log.summary}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
