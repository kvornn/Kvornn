import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Download,
  FileText,
  Flag,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, ApiError } from '../lib/api';
import { ArchiveDTO, ReportCategory } from '../shared/types';
import { resolveLocalizedText } from '../shared/i18n';
import { ResilientImage } from '../components/CategoryVisuals';

interface ArchiveDetailResponse {
  archive: ArchiveDTO;
  category: {
    id: string;
    slug: string;
    nameTr: string;
    nameEn: string;
  };
  subcategory?: {
    id: string;
    slug: string;
    nameTr: string;
    nameEn: string;
  } | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ArchiveDetailPage({ slug }: { slug: string }) {
  const { user, lang, t, navigate } = useApp();
  const [data, setData] = useState<ArchiveDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('INACCURATE_OR_SPAM');
  const [reportDesc, setReportDesc] = useState('');
  const [reportStatus, setReportStatus] = useState<{ ok?: string; err?: string }>({});

  useEffect(() => {
    setLoading(true);
    setDenied(false);
    apiRequest<ArchiveDetailResponse>(`/api/archives/${encodeURIComponent(slug)}`)
      .then((res) => setData(res))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setDenied(true);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleFavorite = async () => {
    if (!data || !user) return;
    const arc = data.archive;
    try {
      if (arc.isFavorited) {
        await apiRequest(`/api/favorites/${arc.id}`, { method: 'DELETE' });
        setData({ ...data, archive: { ...arc, isFavorited: false } });
      } else {
        await apiRequest(`/api/favorites/${arc.id}`, { method: 'POST' });
        setData({ ...data, archive: { ...arc, isFavorited: true } });
      }
    } catch {
      // ignore
    }
  };

  const handleDownload = async (fileId: string, filename: string) => {
    setDownloadError('');
    try {
      const res = await apiRequest<{ downloadUrl: string }>(`/api/files/${fileId}/sign-url`, {
        method: 'POST',
      });
      const link = document.createElement('a');
      link.href = res.downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : t.archiveDetail.downloadDenied);
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setReportStatus({});
    try {
      await apiRequest('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          archiveId: data.archive.id,
          category: reportCategory,
          description: reportDesc,
        }),
      });
      setReportStatus({ ok: t.report.submittedSuccess });
      setReportDesc('');
    } catch (err) {
      setReportStatus({ err: err instanceof Error ? err.message : 'Report submission failed' });
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-[1160px] px-6 py-12">
        <div className="h-72 animate-pulse rounded-lg border border-[#223029] bg-[#101715]" />
      </main>
    );
  }

  if (denied) {
    return (
      <main className="mx-auto max-w-[780px] px-6 py-20 text-center">
        <p className="font-mono text-xs text-[#B89B63]">{t.accessDenied.code}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[#E9E7DF]">
          {t.accessDenied.title}
        </h1>
        <p className="mt-3 text-sm text-[#A9AEA7]">{t.accessDenied.subtitle}</p>
        <div className="mt-8 flex justify-center gap-3">
          {!user && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="rounded-md bg-[#B89B63] px-5 py-2.5 text-xs font-semibold text-[#090D0C]"
            >
              {t.nav.login}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/explorer')}
            className="rounded-md border border-[#26352E] bg-[#101715] px-5 py-2.5 text-xs font-semibold text-[#E9E7DF]"
          >
            {t.archiveDetail.backToExplorer}
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-[780px] px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-[#E9E7DF]">404</h1>
      </main>
    );
  }

  const { archive, category, subcategory } = data;
  const title = resolveLocalizedText(archive.titleTr, archive.titleEn, lang);
  const shortDesc = resolveLocalizedText(archive.shortDescTr, archive.shortDescEn, lang);
  const longDesc = resolveLocalizedText(archive.longDescTr, archive.longDescEn, lang);
  const catName = resolveLocalizedText(category.nameTr, category.nameEn, lang);
  const subName = subcategory
    ? resolveLocalizedText(subcategory.nameTr, subcategory.nameEn, lang)
    : null;

  return (
    <main className="mx-auto max-w-[1200px] px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#A9AEA7]">
          <button
            type="button"
            onClick={() => navigate(`/category/${category.slug}`)}
            className="inline-flex items-center gap-2 hover:text-[#E9E7DF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{catName}</span>
          </button>
          {subcategory && subName && (
            <>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                onClick={() => navigate(`/category/${subcategory.slug}`)}
                className="text-[#B89B63] hover:underline"
              >
                {subName}
              </button>
            </>
          )}
        </div>

        {user && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setReportOpen((v) => !v);
                setReportStatus({});
              }}
              className="inline-flex items-center gap-2 rounded-md border border-[#2A3831] bg-[#101715] px-4 py-2 text-xs font-medium text-[#A9AEA7] hover:border-[#9E3B33] hover:text-[#F3D1CE]"
            >
              <Flag className="h-3.5 w-3.5" />
              <span>{t.report.button}</span>
            </button>

            <button
              type="button"
              onClick={() => void toggleFavorite()}
              className="inline-flex items-center gap-2 rounded-md border border-[#2A3831] bg-[#101715] px-4 py-2 text-xs font-medium text-[#E9E7DF] hover:border-[#B89B63]"
            >
              {archive.isFavorited ? (
                <>
                  <BookmarkCheck className="h-4 w-4 text-[#B89B63]" />
                  <span>{t.archiveDetail.removeFavorite}</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4 text-[#A9AEA7]" />
                  <span>{t.archiveDetail.addFavorite}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {reportOpen && user && (
        <form
          onSubmit={submitReport}
          className="mt-6 rounded-xl border border-[#9E3B33]/50 bg-[#101715] p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">{t.report.title}</h2>
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="text-xs text-[#8D968F] hover:text-[#E9E7DF]"
            >
              ✕
            </button>
          </div>
          {reportStatus.ok && (
            <div className="rounded border border-[#557B67]/60 bg-[#15241D] px-4 py-2.5 text-xs text-[#D6EAE0]">
              {reportStatus.ok}
            </div>
          )}
          {reportStatus.err && (
            <div className="rounded border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-2.5 text-xs text-[#F3D1CE]">
              {reportStatus.err}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="report-category" className="block text-xs text-[#C8CEC7]">
                {t.report.categoryLabel}
              </label>
              <select
                id="report-category"
                value={reportCategory}
                onChange={(e) => setReportCategory(e.target.value as ReportCategory)}
                className="mt-1.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              >
                <option value="COPYRIGHT">{t.report.categories.COPYRIGHT}</option>
                <option value="MALWARE_OR_UNSAFE">{t.report.categories.MALWARE_OR_UNSAFE}</option>
                <option value="PRIVACY_VIOLATION">{t.report.categories.PRIVACY_VIOLATION}</option>
                <option value="ILLEGAL_CONTENT">{t.report.categories.ILLEGAL_CONTENT}</option>
                <option value="INACCURATE_OR_SPAM">{t.report.categories.INACCURATE_OR_SPAM}</option>
                <option value="OTHER">{t.report.categories.OTHER}</option>
              </select>
            </div>
            <div>
              <label htmlFor="report-desc" className="block text-xs text-[#C8CEC7]">
                {t.report.descriptionLabel}
              </label>
              <textarea
                id="report-desc"
                rows={2}
                required
                minLength={10}
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
                placeholder={lang === 'tr' ? 'En az 10 karakter gerekçe girin...' : 'Min 10 characters explanation...'}
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-[#9E3B33] px-4 py-2 text-xs font-semibold text-[#F9EAEA] hover:bg-[#B2473E]"
          >
            {t.report.submit}
          </button>
        </form>
      )}

      {/* Museum Accession Header */}
      <header className="mt-8 border-b border-[#1D2823] pb-8">
        <p className="font-mono text-xs text-[#B89B63] tabular-nums">
          {catName}
          {subName ? ` · ${subName}` : ''}
          {archive.isFeatured ? ` · ${t.explorer.featuredBadge}` : ''}
          {` · ${archive.accessLevel} · ${archive.viewCount} ${
            lang === 'en' && archive.viewCount === 1 ? 'View' : t.explorer.views
          }`}
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-[#E9E7DF] sm:text-5xl text-balance">
          {title}
        </h1>
        {shortDesc && (
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-[#B6BCB5]">{shortDesc}</p>
        )}
      </header>

      {archive.coverImageUrl && (
        <div className="mt-8 overflow-hidden rounded-xl border border-[#223029] bg-[#101715]">
          <ResilientImage
            src={archive.coverImageUrl}
            alt={title}
            fallbackTitle={title}
            className="max-h-[460px] w-full object-cover"
          />
        </div>
      )}

      {/* Asymmetric Reading Canvas + Accession Metadata Grid */}
      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {longDesc && longDesc !== shortDesc && (
            <div className="mb-12 max-w-prose whitespace-pre-line text-base leading-[1.8] text-[#D8DDD7]">
              {longDesc}
            </div>
          )}

          {/* Attached Files */}
          <section className={longDesc && longDesc !== shortDesc ? 'border-t border-[#1D2823] pt-8' : ''}>
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {t.archiveDetail.documents}
            </h2>
            {downloadError && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-3 text-xs text-[#F3D1CE]"
              >
                {downloadError}
              </div>
            )}

            {archive.files.length === 0 ? (
              <p className="mt-4 text-sm text-[#8D968F]">{t.archiveDetail.noFiles}</p>
            ) : (
              <div className="mt-5 divide-y divide-[#1D2823] rounded-lg border border-[#223029] bg-[#101715]">
                {archive.files.map((file) => {
                  const fileAllowed = file.canDownload ?? archive.canDownload;
                  return (
                    <div
                      key={file.id}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#B89B63]" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#E9E7DF] truncate">
                            {file.title || file.originalName}
                          </p>
                          {file.description && (
                            <p className="mt-1 text-xs text-[#A9AEA7]">{file.description}</p>
                          )}
                          <p className="mt-1 font-mono text-[11px] text-[#8D968F] tabular-nums">
                            {file.originalName} · {file.extension.toUpperCase()} · {formatBytes(file.sizeBytes)} · SHA256:{' '}
                            {file.sha256.slice(0, 12)}
                          </p>
                        </div>
                      </div>

                      {!user ? (
                        <button
                          type="button"
                          onClick={() => navigate('/login')}
                          className="text-xs font-medium text-[#B89B63] hover:underline shrink-0"
                        >
                          {t.archiveDetail.signInToDownload}
                        </button>
                      ) : fileAllowed ? (
                        <button
                          type="button"
                          onClick={() => void handleDownload(file.id, file.originalName)}
                          className="inline-flex items-center gap-2 rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C] hover:bg-[#C9AD75] whitespace-nowrap shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>{t.archiveDetail.download}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-[#8D968F] shrink-0">
                          {t.archiveDetail.downloadDenied}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Accession Metadata Rail */}
        <aside className="lg:col-span-4">
          <div className="rounded-lg border border-[#223029] bg-[#101715] p-6">
            <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
              {t.archiveDetail.metadata}
            </h2>
            <dl className="mt-5 divide-y divide-[#1D2823] text-sm">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[#8D968F]">{t.archiveDetail.category}</dt>
                <dd className="text-right font-medium text-[#E9E7DF]">{catName}</dd>
              </div>
              {subName && (
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-[#8D968F]">{t.archiveDetail.subcategory}</dt>
                  <dd className="text-right font-medium text-[#E9E7DF]">{subName}</dd>
                </div>
              )}
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[#8D968F]">{t.archiveDetail.status}</dt>
                <dd className="font-mono text-xs text-[#557B67]">{archive.status}</dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[#8D968F]">{t.archiveDetail.accessLevel}</dt>
                <dd className="text-right text-[#E9E7DF]">{archive.accessLevel}</dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[#8D968F]">{t.archiveDetail.publishedAt}</dt>
                <dd className="font-mono text-xs text-[#A9AEA7] tabular-nums">
                  {archive.publishedAt
                    ? new Date(archive.publishedAt).toLocaleDateString(
                        lang === 'tr' ? 'tr-TR' : 'en-US'
                      )
                    : '—'}
                </dd>
              </div>
              <div className="py-3">
                <dt className="text-[#8D968F]">{t.archiveDetail.sourceInfo}</dt>
                <dd className="mt-1.5 text-xs leading-relaxed text-[#C8CEC7]">
                  {archive.sourceInfo || t.archiveDetail.noSourceRecorded}
                </dd>
              </div>
            </dl>

            {archive.tags.length > 0 && (
              <div className="mt-5 border-t border-[#1D2823] pt-4">
                <p className="text-xs text-[#8D968F]">{t.archiveDetail.tags}</p>
                <p className="mt-2 text-xs leading-relaxed text-[#C8CEC7]">
                  {archive.tags.map((tag) => `#${tag}`).join(' · ')}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
