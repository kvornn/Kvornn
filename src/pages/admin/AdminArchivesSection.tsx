import React, { useCallback, useEffect, useState } from 'react';
import { Star, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest, uploadWithProgress } from '../../lib/api';
import { resolveLocalizedText } from '../../shared/i18n';
import {
  ASSIGNABLE_MEMBER_RANKS,
  ArchiveDTO,
  CategoryDTO,
  PublicationStatus,
  RoleDTO,
  RuleEffect,
} from '../../shared/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function AdminArchivesSection() {
  const { lang, t } = useApp();
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [archives, setArchives] = useState<ArchiveDTO[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleDTO[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [titleTr, setTitleTr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [shortDescTr, setShortDescTr] = useState('');
  const [shortDescEn, setShortDescEn] = useState('');
  const [longDescTr, setLongDescTr] = useState('');
  const [longDescEn, setLongDescEn] = useState('');
  const [sourceInfo, setSourceInfo] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [accessLevel, setAccessLevel] = useState('STANDARD');
  const [searchVisible, setSearchVisible] = useState(true);
  const [status, setStatus] = useState<PublicationStatus>('PUBLISHED');
  const [roleRules, setRoleRules] = useState<Record<string, RuleEffect>>({
    UYE: 'INHERIT',
    DESTEKCI: 'INHERIT',
    ISLETME: 'INHERIT',
  });

  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [catRes, arcRes, roleRes] = await Promise.all([
        apiRequest<{ categories: CategoryDTO[] }>('/api/admin/categories').catch(() => ({
          categories: [],
        })),
        apiRequest<{ archives: ArchiveDTO[] }>('/api/admin/archives').catch(() => ({
          archives: [],
        })),
        apiRequest<{ roles: RoleDTO[] }>('/api/admin/roles').catch(() => ({ roles: [] })),
      ]);
      const allCats = catRes.categories || [];
      setCategories(allCats);
      setArchives(arcRes.archives || []);
      setCustomRoles((roleRes.roles || []).filter((r) => !r.isSystemRank && !r.isAdminRole));
      const topCats = allCats.filter((c) => !c.parentId);
      if (topCats.length > 0 && !categoryId) {
        setCategoryId(topCats[0].id);
      } else if (allCats.length > 0 && !categoryId) {
        setCategoryId(allCats[0].id);
      }
    } catch {
      // ignore
    }
  }, [categoryId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = () => {
    setEditingId(null);
    setSubcategoryId('');
    setTitleTr('');
    setTitleEn('');
    setShortDescTr('');
    setShortDescEn('');
    setLongDescTr('');
    setLongDescEn('');
    setSourceInfo('');
    setPublishedAt('');
    setIsFeatured(false);
    setCoverImageUrl('');
    setTagsText('');
    setAccessLevel('STANDARD');
    setSearchVisible(true);
    setStatus('PUBLISHED');
    setRoleRules({ UYE: 'INHERIT', DESTEKCI: 'INHERIT', ISLETME: 'INHERIT' });
  };

  const saveArchiveWithStatus = async (overrideStatus?: PublicationStatus) => {
    setErr('');
    setMsg('');
    setBusy(true);
    const chosenStatus = overrideStatus || status;
    const payload = {
      categoryId,
      subcategoryId: subcategoryId || null,
      titleTr,
      titleEn,
      shortDescTr,
      shortDescEn,
      longDescTr,
      longDescEn,
      sourceInfo,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      isFeatured,
      coverImageUrl,
      tags: tagsText,
      accessLevel,
      searchVisible,
      status: chosenStatus,
      roleRules,
    };

    try {
      if (editingId) {
        await apiRequest(`/api/admin/archives/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setMsg(lang === 'tr' ? 'Arşiv güncellendi.' : 'Archive updated.');
      } else {
        await apiRequest('/api/admin/archives', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg(
          chosenStatus === 'DRAFT'
            ? lang === 'tr'
              ? 'Arşiv taslak olarak kaydedildi.'
              : 'Archive saved as draft.'
            : lang === 'tr'
            ? 'Arşiv oluşturuldu.'
            : 'Archive created.'
        );
      }
      resetForm();
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void saveArchiveWithStatus();
  };

  const startEdit = (a: ArchiveDTO) => {
    setEditingId(a.id);
    setCategoryId(a.categoryId);
    setSubcategoryId(a.subcategoryId || '');
    setTitleTr(a.titleTr);
    setTitleEn(a.titleEn);
    setShortDescTr(a.shortDescTr);
    setShortDescEn(a.shortDescEn);
    setLongDescTr(a.longDescTr);
    setLongDescEn(a.longDescEn);
    setSourceInfo(a.sourceInfo || '');
    setPublishedAt(a.publishedAt ? a.publishedAt.slice(0, 16) : '');
    setIsFeatured(Boolean(a.isFeatured));
    setCoverImageUrl(a.coverImageUrl || '');
    setTagsText(a.tags.join(', '));
    setAccessLevel(a.accessLevel);
    setSearchVisible(a.searchVisible);
    setStatus(a.status);
    setRoleRules(a.roleRules || { UYE: 'INHERIT', DESTEKCI: 'INHERIT', ISLETME: 'INHERIT' });
  };

  const handleFileUpload = async (archiveId: string, file: File) => {
    setErr('');
    setMsg('');
    setUploadProgress(0);
    const form = new FormData();
    form.append('file', file);
    try {
      await uploadWithProgress(`/api/admin/archives/${archiveId}/files`, form, (p) =>
        setUploadProgress(p)
      );
      setMsg(lang === 'tr' ? `Dosya eklendi: ${file.name}` : `Attached ${file.name} securely.`);
      setUploadTargetId(null);
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload rejected');
    } finally {
      setUploadProgress(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setErr('');
    try {
      await apiRequest(`/api/admin/archives/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg(
        lang === 'tr'
          ? `Arşiv silindi: ${deleteTarget.slug}`
          : `Deleted archive: ${deleteTarget.slug}`
      );
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const topCategories = categories.filter((c) => !c.parentId);
  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-[#B89B63]/40 bg-[#101715] p-8 text-center">
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {t.admin.categoryRequiredWarning}
        </h2>
        <p className="mt-2 text-xs text-[#A9AEA7]">
          {lang === 'tr'
            ? 'Önce Categories bölümünden en az bir kategori oluşturun.'
            : 'Please create at least one category in Categories first.'}
        </p>
      </div>
    );
  }

  const subcategories = categories.filter((c) => c.parentId === categoryId);
  const ruleTargets = [
    ...ASSIGNABLE_MEMBER_RANKS.map((r) => ({ id: r, label: t.ranks[r] })),
    ...customRoles.map((cr) => ({
      id: cr.id,
      label: resolveLocalizedText(cr.displayNameTr, cr.displayNameEn, lang),
    })),
  ];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={lang === 'tr' ? 'Arşivi Sil' : 'Delete Archive'}
        message={
          deleteTarget
            ? lang === 'tr'
              ? `"${deleteTarget.titleTr}" arşivini ve ekli tüm dosyalarını kalıcı olarak silmek istiyor musunuz?`
              : `Permanently delete archive "${deleteTarget.titleEn}" and all attached files?`
            : ''
        }
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-[#223029] bg-[#101715] p-6 lg:col-span-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {editingId
              ? lang === 'tr'
                ? 'Arşivi Düzenle'
                : 'Edit Archive'
              : t.admin.createArchive}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-[#8D968F] hover:text-[#E9E7DF]"
            >
              {t.common.cancel}
            </button>
          )}
        </div>

        {msg && (
          <div className="rounded border border-[#557B67]/60 bg-[#15241D] px-3 py-2 text-xs text-[#D6EAE0]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded border border-[#9E3B33]/60 bg-[#3B1816]/50 px-3 py-2 text-xs text-[#F3D1CE]">
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="arc-cat" className="block text-xs text-[#C8CEC7]">
              Category
            </label>
            <select
              id="arc-cat"
              required
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSubcategoryId('');
              }}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              {(topCategories.length ? topCategories : categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {resolveLocalizedText(c.nameTr, c.nameEn, lang)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="arc-subcat" className="block text-xs text-[#C8CEC7]">
              Subcategory
            </label>
            <select
              id="arc-subcat"
              value={subcategoryId}
              onChange={(e) => setSubcategoryId(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="">None</option>
              {subcategories.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {resolveLocalizedText(sc.nameTr, sc.nameEn, lang)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="arc-status" className="block text-xs text-[#C8CEC7]">
              Status
            </label>
            <select
              id="arc-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as PublicationStatus)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="HIDDEN">HIDDEN</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="arc-title-tr" className="block text-xs text-[#C8CEC7]">
              Title (TR)
            </label>
            <input
              id="arc-title-tr"
              type="text"
              required
              value={titleTr}
              onChange={(e) => setTitleTr(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="arc-title-en" className="block text-xs text-[#C8CEC7]">
              Title (EN)
            </label>
            <input
              id="arc-title-en"
              type="text"
              required
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="arc-sdesc-tr" className="block text-xs text-[#C8CEC7]">
              Short Summary (TR)
            </label>
            <input
              id="arc-sdesc-tr"
              type="text"
              value={shortDescTr}
              onChange={(e) => setShortDescTr(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="arc-sdesc-en" className="block text-xs text-[#C8CEC7]">
              Short Summary (EN)
            </label>
            <input
              id="arc-sdesc-en"
              type="text"
              value={shortDescEn}
              onChange={(e) => setShortDescEn(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="arc-ldesc-tr" className="block text-xs text-[#C8CEC7]">
            Full Description (TR)
          </label>
          <textarea
            id="arc-ldesc-tr"
            rows={3}
            value={longDescTr}
            onChange={(e) => setLongDescTr(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>
        <div>
          <label htmlFor="arc-ldesc-en" className="block text-xs text-[#C8CEC7]">
            Full Description (EN)
          </label>
          <textarea
            id="arc-ldesc-en"
            rows={3}
            value={longDescEn}
            onChange={(e) => setLongDescEn(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="arc-source" className="block text-xs text-[#C8CEC7]">
              {t.archiveDetail.sourceInfo}
            </label>
            <input
              id="arc-source"
              type="text"
              value={sourceInfo}
              onChange={(e) => setSourceInfo(e.target.value)}
              placeholder="Primary Gazette / Repository Ref..."
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="arc-pubdate" className="block text-xs text-[#C8CEC7]">
              {lang === 'tr' ? 'Yayın Tarihi (Opsiyonel)' : 'Publish Date (Optional)'}
            </label>
            <input
              id="arc-pubdate"
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 font-mono text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="arc-tags" className="block text-xs text-[#C8CEC7]">
              Tags (comma separated)
            </label>
            <input
              id="arc-tags"
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="history, manuscript"
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="arc-access" className="block text-xs text-[#C8CEC7]">
              Access Level Label
            </label>
            <input
              id="arc-access"
              type="text"
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="arc-cover" className="block text-xs text-[#C8CEC7]">
            Cover Image URL
          </label>
          <input
            id="arc-cover"
            type="text"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="/src/assets/images/..."
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>

        <div className="flex flex-wrap gap-5 pt-1">
          <label className="flex items-center gap-2 text-xs text-[#C8CEC7]">
            <input
              type="checkbox"
              checked={searchVisible}
              onChange={(e) => setSearchVisible(e.target.checked)}
              className="accent-[#B89B63]"
            />
            <span>{lang === 'tr' ? 'Aramada Görünür' : 'Visible in Explorer Search'}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-[#B89B63]">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="accent-[#B89B63]"
            />
            <span>{lang === 'tr' ? 'Öne Çıkan Arşiv' : 'Featured Archive'}</span>
          </label>
        </div>

        <div className="border-t border-[#1D2823] pt-3">
          <p className="text-xs font-medium text-[#C8CEC7]">Rank & Custom Role Overrides</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ruleTargets.map((target) => (
              <div key={target.id}>
                <label className="block truncate text-[11px] text-[#8D968F]">{target.label}</label>
                <select
                  aria-label={`Archive rule for ${target.id}`}
                  value={roleRules[target.id] || 'INHERIT'}
                  onChange={(e) =>
                    setRoleRules((prev) => ({
                      ...prev,
                      [target.id]: e.target.value as RuleEffect,
                    }))
                  }
                  className="mt-1 w-full rounded border border-[#26352E] bg-[#090D0C] px-2 py-1.5 text-xs text-[#E9E7DF]"
                >
                  <option value="INHERIT">INHERIT</option>
                  <option value="ALLOW">ALLOW</option>
                  <option value="DENY">DENY</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        {editingId ? (
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#B89B63] py-2.5 text-xs font-semibold text-[#090D0C] disabled:opacity-50"
          >
            {t.admin.saveChanges}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveArchiveWithStatus('DRAFT')}
              className="rounded-md border border-[#26352E] bg-[#090D0C] py-2.5 text-xs font-medium text-[#E9E7DF] hover:border-[#B89B63] disabled:opacity-50"
            >
              {lang === 'tr' ? 'Taslak Kaydet' : 'Save Draft'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveArchiveWithStatus('PUBLISHED')}
              className="rounded-md bg-[#B89B63] py-2.5 text-xs font-semibold text-[#090D0C] hover:bg-[#C9AD75] disabled:opacity-50"
            >
              {lang === 'tr' ? 'Yayınla' : 'Publish'}
            </button>
          </div>
        )}
      </form>

      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6 lg:col-span-7">
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {t.admin.menu.archives} ({archives.length})
        </h2>
        {archives.length === 0 ? (
          <p className="mt-6 text-sm text-[#8D968F]">
            {lang === 'tr' ? 'Henüz arşiv oluşturulmadı.' : 'No archives created yet.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[#1D2823]">
            {archives.map((a) => (
              <div key={a.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {a.isFeatured && <Star className="h-3.5 w-3.5 text-[#B89B63] shrink-0" />}
                      <p className="truncate font-medium text-[#E9E7DF]">
                        {resolveLocalizedText(a.titleTr, a.titleEn, lang)}
                      </p>
                    </div>
                    <p className="font-mono text-[11px] text-[#8D968F] tabular-nums">
                      /{a.slug} · {a.status} · {a.files.length} files · {a.viewCount} views
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadTargetId(uploadTargetId === a.id ? null : a.id)}
                      className="rounded border border-[#26352E] px-2.5 py-1 text-xs text-[#B89B63] hover:border-[#B89B63]"
                    >
                      <Upload className="mr-1 inline h-3 w-3" />
                      Attach File
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="rounded border border-[#26352E] px-2.5 py-1 text-xs text-[#E9E7DF] hover:border-[#B89B63]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(a)}
                      className="rounded border border-[#26352E] p-1.5 text-[#E58A82] hover:border-[#9E3B33]"
                      aria-label={`Delete ${a.slug}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {uploadTargetId === a.id && (
                  <div className="mt-3 rounded border border-[#26352E] bg-[#090D0C] p-3">
                    <input
                      type="file"
                      aria-label="Upload archive file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFileUpload(a.id, f);
                      }}
                      className="text-xs text-[#C8CEC7]"
                    />
                    {uploadProgress !== null && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#18221D]">
                        <div
                          className="h-full bg-[#B89B63] transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-[#8D968F]">
                      Safe types only (PDF, TXT, MD, CSV, JSON, PNG, JPG, WEBP, ZIP, DOCX, XLSX). HTML/SVG/JS blocked.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
