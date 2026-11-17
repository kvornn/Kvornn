import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, EyeOff, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { ContentReportDTO } from '../../shared/types';
import { resolveLocalizedText } from '../../shared/i18n';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function AdminReportsSection() {
  const { lang, t } = useApp();
  const [reports, setReports] = useState<ContentReportDTO[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [pendingAction, setPendingAction] = useState<{
    report: ContentReportDTO;
    action: 'DISMISS' | 'HIDE_ARCHIVE' | 'DELETE_ARCHIVE';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadReports = useCallback(async () => {
    try {
      const res = await apiRequest<{ reports: ContentReportDTO[] }>('/api/admin/reports');
      setReports(res.reports || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reports');
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const executeModeration = async (resolutionNote: string) => {
    if (!pendingAction) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/api/admin/reports/${pendingAction.report.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: pendingAction.action,
          resolutionNote,
        }),
      });
      setMsg(
        lang === 'tr'
          ? `Moderasyon kararı uygulandı: ${pendingAction.action}`
          : `Moderation action executed: ${pendingAction.action}`
      );
      setPendingAction(null);
      await loadReports();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Moderation failed');
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  };

  const visibleReports = reports.filter((r) => {
    if (filter === 'OPEN') return r.status === 'OPEN';
    if (filter === 'RESOLVED') return r.status !== 'OPEN';
    return true;
  });

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={
          pendingAction?.action === 'DELETE_ARCHIVE'
            ? lang === 'tr'
              ? 'Arşivi Kalıcı Olarak Sil'
              : 'Permanently Delete Reported Archive'
            : pendingAction?.action === 'HIDE_ARCHIVE'
            ? lang === 'tr'
              ? 'Arşivi Gizle (HIDDEN)'
              : 'Hide Reported Archive'
            : lang === 'tr'
            ? 'Bildirimi Reddet'
            : 'Dismiss Content Report'
        }
        message={
          pendingAction
            ? `${resolveLocalizedText(
                pendingAction.report.archiveTitleTr,
                pendingAction.report.archiveTitleEn,
                lang
              )} — ${
                lang === 'tr'
                  ? 'Kararınız değişmez denetim defterine işlenecektir.'
                  : 'This decision will be permanently recorded in the audit ledger.'
              }`
            : ''
        }
        danger={pendingAction?.action !== 'DISMISS'}
        requireReason
        minReasonLength={5}
        reasonLabel={
          lang === 'tr'
            ? 'Zorunlu Denetim Gerekçesi (En az 5 karakter)'
            : 'Mandatory Audit Justification (min 5 chars)'
        }
        busy={busy}
        onConfirm={(note) => void executeModeration(note)}
        onCancel={() => setPendingAction(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium ${
                filter === tab
                  ? 'bg-[#B89B63] text-[#090D0C]'
                  : 'border border-[#26352E] bg-[#101715] text-[#A9AEA7]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-[#8D968F] tabular-nums">
          {visibleReports.length} / {reports.length}
        </span>
      </div>

      {msg && (
        <div className="rounded-md border border-[#557B67]/60 bg-[#15241D] px-4 py-2.5 text-xs text-[#D6EAE0]">
          {msg}
        </div>
      )}
      {err && (
        <div
          role="alert"
          className="rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-2.5 text-xs text-[#F3D1CE]"
        >
          {err}
        </div>
      )}

      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6">
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {t.admin.menu.reports}
        </h2>

        {visibleReports.length === 0 ? (
          <p className="mt-4 text-sm text-[#8D968F]">
            {lang === 'tr' ? 'Bildirim bulunmuyor.' : 'No content reports in this queue.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[#1D2823] border-t border-[#1D2823]">
            {visibleReports.map((r) => (
              <div key={r.id} className="py-4 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-mono font-semibold ${
                          r.status === 'OPEN' ? 'text-[#E58A82]' : 'text-[#557B67]'
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="font-mono text-[#B89B63]">{r.category}</span>
                      <span className="text-[#8D968F]">·</span>
                      <span className="font-medium text-[#E9E7DF]">
                        {resolveLocalizedText(r.archiveTitleTr, r.archiveTitleEn, lang)}
                      </span>
                      <span className="font-mono text-[11px] text-[#6F7871]">
                        ({r.archiveStatus})
                      </span>
                    </div>
                    <p className="text-[#C8CEC7]">{r.description}</p>
                    <p className="font-mono text-[11px] text-[#8D968F] tabular-nums">
                      Reporter: {r.reporterUsername} ·{' '}
                      {new Date(r.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                    </p>
                    {r.resolutionNote && (
                      <p className="font-mono text-[11px] text-[#557B67]">
                        Resolution ({r.actionTaken} by {r.reviewedByName || 'ADMIN'}):{' '}
                        {r.resolutionNote}
                      </p>
                    )}
                  </div>

                  {r.status === 'OPEN' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingAction({ report: r, action: 'HIDE_ARCHIVE' })}
                        className="inline-flex items-center gap-1.5 rounded border border-[#B89B63]/60 px-2.5 py-1.5 text-xs text-[#B89B63] hover:bg-[#151E1A]"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>{lang === 'tr' ? 'Gizle' : 'Hide'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingAction({ report: r, action: 'DELETE_ARCHIVE' })}
                        className="inline-flex items-center gap-1.5 rounded border border-[#9E3B33]/60 px-2.5 py-1.5 text-xs text-[#E58A82] hover:bg-[#3B1816]/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{lang === 'tr' ? 'Sil' : 'Delete'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingAction({ report: r, action: 'DISMISS' })}
                        className="inline-flex items-center gap-1.5 rounded border border-[#557B67]/60 px-2.5 py-1.5 text-xs text-[#D6EAE0] hover:bg-[#15241D]"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>{lang === 'tr' ? 'Reddet' : 'Dismiss'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
