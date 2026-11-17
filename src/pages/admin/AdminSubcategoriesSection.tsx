import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { resolveLocalizedText } from '../../shared/i18n';
import {
  ASSIGNABLE_MEMBER_RANKS,
  CategoryDTO,
  RoleDTO,
  RuleEffect,
} from '../../shared/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function AdminSubcategoriesSection() {
  const { lang, t } = useApp();
  const [parents, setParents] = useState<CategoryDTO[]>([]);
  const [subcategories, setSubcategories] = useState<CategoryDTO[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleDTO[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [parentId, setParentId] = useState('');
  const [nameTr, setNameTr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [slug, setSlug] = useState('');
  const [descriptionTr, setDescriptionTr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'HIDDEN' | 'ARCHIVED'>('PUBLIC');
  const [sortOrder, setSortOrder] = useState(0);
  const [roleRules, setRoleRules] = useState<Record<string, RuleEffect>>({
    UYE: 'INHERIT',
    DESTEKCI: 'INHERIT',
    ISLETME: 'INHERIT',
  });

  const [filterParentId, setFilterParentId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CategoryDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [catRes, roleRes] = await Promise.all([
        apiRequest<{ categories: CategoryDTO[] }>('/api/admin/categories'),
        apiRequest<{ roles: RoleDTO[] }>('/api/admin/roles').catch(() => ({ roles: [] })),
      ]);
      const all = catRes.categories || [];
      const top = all.filter((c) => !c.parentId);
      const subs = all.filter((c) => Boolean(c.parentId));
      setParents(top);
      setSubcategories(subs);
      setCustomRoles((roleRes.roles || []).filter((r) => !r.isSystemRank && !r.isAdminRole));
      if (top.length > 0 && !parentId) {
        setParentId(top[0].id);
      }
    } catch {
      // ignore
    }
  }, [parentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = () => {
    setEditingId(null);
    setNameTr('');
    setNameEn('');
    setSlug('');
    setDescriptionTr('');
    setDescriptionEn('');
    setVisibility('PUBLIC');
    setSortOrder(subcategories.length);
    setRoleRules({ UYE: 'INHERIT', DESTEKCI: 'INHERIT', ISLETME: 'INHERIT' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentId) {
      setErr(lang === 'tr' ? 'Üst kategori seçilmelidir.' : 'Parent category is required.');
      return;
    }
    setErr('');
    setMsg('');
    setBusy(true);

    const payload = {
      parentId,
      nameTr,
      nameEn,
      slug,
      descriptionTr,
      descriptionEn,
      visibility,
      sortOrder,
      roleRules,
    };

    try {
      if (editingId) {
        await apiRequest(`/api/admin/categories/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setMsg(lang === 'tr' ? 'Alt kategori güncellendi.' : 'Subcategory updated.');
      } else {
        await apiRequest('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg(lang === 'tr' ? 'Alt kategori oluşturuldu.' : 'Subcategory created.');
      }
      resetForm();
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (sc: CategoryDTO) => {
    setEditingId(sc.id);
    setParentId(sc.parentId || parents[0]?.id || '');
    setNameTr(sc.nameTr);
    setNameEn(sc.nameEn);
    setSlug(sc.slug);
    setDescriptionTr(sc.descriptionTr);
    setDescriptionEn(sc.descriptionEn);
    setVisibility(sc.visibility);
    setSortOrder(sc.sortOrder);
    setRoleRules(
      sc.roleRules || { UYE: 'INHERIT', DESTEKCI: 'INHERIT', ISLETME: 'INHERIT' }
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await apiRequest(`/api/admin/categories/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg(
        lang === 'tr'
          ? `Alt kategori silindi: ${deleteTarget.slug}`
          : `Deleted subcategory: ${deleteTarget.slug}`
      );
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete blocked');
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  if (parents.length === 0) {
    return (
      <div className="rounded-xl border border-[#B89B63]/40 bg-[#101715] p-8 text-center">
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {lang === 'tr'
            ? 'Önce bir Ana Kategori oluşturun'
            : 'Create a Top-Level Category First'}
        </h2>
        <p className="mt-2 text-xs text-[#A9AEA7]">
          {lang === 'tr'
            ? 'Alt kategoriler yalnızca mevcut bir ana kategoriye bağlanabilir.'
            : 'Subcategories must belong to an existing top-level category.'}
        </p>
      </div>
    );
  }

  const ruleTargets = [
    ...ASSIGNABLE_MEMBER_RANKS.map((r) => ({ id: r, label: t.ranks[r] })),
    ...customRoles.map((cr) => ({
      id: cr.id,
      label: resolveLocalizedText(cr.displayNameTr, cr.displayNameEn, lang),
    })),
  ];

  const parentMap = new Map(parents.map((p) => [p.id, p]));
  const visibleSubs = filterParentId
    ? subcategories.filter((s) => s.parentId === filterParentId)
    : subcategories;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={lang === 'tr' ? 'Alt Kategoriyi Sil' : 'Delete Subcategory'}
        message={
          deleteTarget
            ? lang === 'tr'
              ? `"${deleteTarget.nameTr}" alt kategorisini silmek istediğinize emin misiniz?`
              : `Delete subcategory "${deleteTarget.nameEn}"?`
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
                ? 'Alt Kategoriyi Düzenle'
                : 'Edit Subcategory'
              : t.admin.createSubcategory}
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

        <div>
          <label htmlFor="sub-parent" className="block text-xs text-[#C8CEC7]">
            {lang === 'tr' ? 'Bağlı Olduğu Ana Kategori' : 'Parent Category'}
          </label>
          <select
            id="sub-parent"
            required
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          >
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {resolveLocalizedText(p.nameTr, p.nameEn, lang)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="sub-name-tr" className="block text-xs text-[#C8CEC7]">
              Name (TR)
            </label>
            <input
              id="sub-name-tr"
              type="text"
              required
              value={nameTr}
              onChange={(e) => setNameTr(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="sub-name-en" className="block text-xs text-[#C8CEC7]">
              Name (EN)
            </label>
            <input
              id="sub-name-en"
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="sub-slug" className="block text-xs text-[#C8CEC7]">
              URL Slug
            </label>
            <input
              id="sub-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated"
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 font-mono text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="sub-vis" className="block text-xs text-[#C8CEC7]">
              Visibility
            </label>
            <select
              id="sub-vis"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-2.5 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="PUBLIC">PUBLIC</option>
              <option value="HIDDEN">HIDDEN</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
          <div>
            <label htmlFor="sub-order" className="block text-xs text-[#C8CEC7]">
              Sort Order
            </label>
            <input
              id="sub-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 font-mono text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="sub-desc-tr" className="block text-xs text-[#C8CEC7]">
            Description (TR)
          </label>
          <textarea
            id="sub-desc-tr"
            rows={2}
            value={descriptionTr}
            onChange={(e) => setDescriptionTr(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>
        <div>
          <label htmlFor="sub-desc-en" className="block text-xs text-[#C8CEC7]">
            Description (EN)
          </label>
          <textarea
            id="sub-desc-en"
            rows={2}
            value={descriptionEn}
            onChange={(e) => setDescriptionEn(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>

        <div className="border-t border-[#1D2823] pt-3">
          <p className="text-xs font-medium text-[#C8CEC7]">Access Rules</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ruleTargets.map((target) => (
              <div key={target.id}>
                <label className="block truncate text-[11px] text-[#8D968F]">{target.label}</label>
                <select
                  aria-label={`Subcategory rule for ${target.id}`}
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

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-[#B89B63] py-2.5 text-xs font-semibold text-[#090D0C] disabled:opacity-50"
        >
          {editingId ? t.admin.saveChanges : t.admin.createSubcategory}
        </button>
      </form>

      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {t.admin.menu.subcategories} ({visibleSubs.length})
          </h2>
          <select
            aria-label="Filter by parent category"
            value={filterParentId}
            onChange={(e) => setFilterParentId(e.target.value)}
            className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-1.5 text-xs text-[#E9E7DF]"
          >
            <option value="">{lang === 'tr' ? 'Tüm Ana Kategoriler' : 'All Parent Categories'}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {resolveLocalizedText(p.nameTr, p.nameEn, lang)}
              </option>
            ))}
          </select>
        </div>

        {visibleSubs.length === 0 ? (
          <p className="mt-6 text-sm text-[#8D968F]">
            {lang === 'tr'
              ? 'Henüz alt kategori oluşturulmadı.'
              : 'No subcategories created yet.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[#1D2823]">
            {visibleSubs.map((sc) => {
              const p = sc.parentId ? parentMap.get(sc.parentId) : undefined;
              return (
                <div key={sc.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#E9E7DF]">
                      {resolveLocalizedText(sc.nameTr, sc.nameEn, lang)}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#8D968F] tabular-nums">
                      {p ? `${resolveLocalizedText(p.nameTr, p.nameEn, lang)} / ` : ''}/{sc.slug} ·{' '}
                      {sc.visibility} · {sc.archiveCount} archives
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(sc)}
                      className="rounded border border-[#26352E] px-2.5 py-1 text-xs text-[#E9E7DF] hover:border-[#B89B63]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(sc)}
                      className="rounded border border-[#26352E] p-1.5 text-[#E58A82] hover:border-[#9E3B33]"
                      aria-label={`Delete ${sc.slug}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
