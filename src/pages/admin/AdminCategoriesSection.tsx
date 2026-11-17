import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { resolveLocalizedText } from '../../shared/i18n';
import {
  ASSIGNABLE_MEMBER_RANKS,
  CategoryDTO,
  RoleDTO,
  RuleEffect,
} from '../../shared/types';
import { CATEGORY_ICON_OPTIONS, CategoryIcon } from '../../components/CategoryVisuals';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function AdminCategoriesSection() {
  const { lang, t } = useApp();
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [allItems, setAllItems] = useState<CategoryDTO[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleDTO[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [nameTr, setNameTr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [slug, setSlug] = useState('');
  const [descriptionTr, setDescriptionTr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [icon, setIcon] = useState('Archive');
  const [accentColor, setAccentColor] = useState('#B89B63');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'HIDDEN' | 'ARCHIVED'>('PUBLIC');
  const [sortOrder, setSortOrder] = useState(0);
  const [roleRules, setRoleRules] = useState<Record<string, RuleEffect>>({
    UYE: 'INHERIT',
    DESTEKCI: 'INHERIT',
    ISLETME: 'INHERIT',
  });

  const [deleteTarget, setDeleteTarget] = useState<CategoryDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      const [catRes, roleRes] = await Promise.all([
        apiRequest<{ categories: CategoryDTO[] }>('/api/admin/categories'),
        apiRequest<{ roles: RoleDTO[] }>('/api/admin/roles').catch(() => ({ roles: [] })),
      ]);
      const all = catRes.categories || [];
      setAllItems(all);
      setCategories(all.filter((c) => !c.parentId));
      setCustomRoles((roleRes.roles || []).filter((r) => !r.isSystemRank && !r.isAdminRole));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const resetForm = () => {
    setEditingId(null);
    setNameTr('');
    setNameEn('');
    setSlug('');
    setDescriptionTr('');
    setDescriptionEn('');
    setIcon('Archive');
    setAccentColor('#B89B63');
    setCoverImageUrl('');
    setVisibility('PUBLIC');
    setSortOrder(categories.length);
    setRoleRules({ UYE: 'INHERIT', DESTEKCI: 'INHERIT', ISLETME: 'INHERIT' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    const payload = {
      nameTr,
      nameEn,
      slug,
      descriptionTr,
      descriptionEn,
      icon,
      accentColor,
      coverImageUrl,
      parentId: null,
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
        setMsg(lang === 'tr' ? 'Kategori güncellendi.' : 'Category updated.');
      } else {
        await apiRequest('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg(lang === 'tr' ? 'Kategori oluşturuldu.' : 'Category created.');
      }
      resetForm();
      await loadCategories();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: CategoryDTO) => {
    setEditingId(c.id);
    setNameTr(c.nameTr);
    setNameEn(c.nameEn);
    setSlug(c.slug);
    setDescriptionTr(c.descriptionTr);
    setDescriptionEn(c.descriptionEn);
    setIcon(c.icon || 'Archive');
    setAccentColor(c.accentColor || '#B89B63');
    setCoverImageUrl(c.coverImageUrl || '');
    setVisibility(c.visibility);
    setSortOrder(c.sortOrder);
    setRoleRules(
      c.roleRules || { UYE: 'INHERIT', DESTEKCI: 'INHERIT', ISLETME: 'INHERIT' }
    );
  };

  const moveOrder = async (index: number, delta: -1 | 1) => {
    const next = [...categories];
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    setCategories(next);
    const subIds = allItems.filter((x) => x.parentId).map((x) => x.id);
    await apiRequest('/api/admin/categories/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds: [...next.map((c) => c.id), ...subIds] }),
    });
    await loadCategories();
  };

  const toggleArchiveVisibility = async (c: CategoryDTO) => {
    const nextVis = c.visibility === 'ARCHIVED' ? 'PUBLIC' : 'ARCHIVED';
    await apiRequest(`/api/admin/categories/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility: nextVis }),
    });
    await loadCategories();
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
          ? `Kategori silindi: ${deleteTarget.slug}`
          : `Deleted category: ${deleteTarget.slug}`
      );
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await loadCategories();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete blocked');
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

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
        title={lang === 'tr' ? 'Kategoriyi Sil' : 'Delete Category'}
        message={
          deleteTarget
            ? lang === 'tr'
              ? `"${deleteTarget.nameTr}" kategorisini kalıcı olarak silmek istiyor musunuz? (İçinde alt kategori veya arşiv varsa işlem engellenir.)`
              : `Permanently delete category "${deleteTarget.nameEn}"? (Blocked if subcategories or archives still exist inside.)`
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
                ? 'Kategoriyi Düzenle'
                : 'Edit Category'
              : t.admin.createCategory}
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cat-name-tr" className="block text-xs text-[#C8CEC7]">
              Name (TR)
            </label>
            <input
              id="cat-name-tr"
              type="text"
              required
              value={nameTr}
              onChange={(e) => setNameTr(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="cat-name-en" className="block text-xs text-[#C8CEC7]">
              Name (EN)
            </label>
            <input
              id="cat-name-en"
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cat-slug" className="block text-xs text-[#C8CEC7]">
              URL Slug
            </label>
            <input
              id="cat-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated"
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 font-mono text-xs text-[#E9E7DF]"
            />
          </div>
          <div>
            <label htmlFor="cat-order" className="block text-xs text-[#C8CEC7]">
              Sort Order
            </label>
            <input
              id="cat-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 font-mono text-xs text-[#E9E7DF]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cat-desc-tr" className="block text-xs text-[#C8CEC7]">
            Description (TR)
          </label>
          <textarea
            id="cat-desc-tr"
            rows={2}
            value={descriptionTr}
            onChange={(e) => setDescriptionTr(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>
        <div>
          <label htmlFor="cat-desc-en" className="block text-xs text-[#C8CEC7]">
            Description (EN)
          </label>
          <textarea
            id="cat-desc-en"
            rows={2}
            value={descriptionEn}
            onChange={(e) => setDescriptionEn(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="cat-icon" className="block text-xs text-[#C8CEC7]">
              Icon
            </label>
            <select
              id="cat-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-2.5 py-2 text-xs text-[#E9E7DF]"
            >
              {CATEGORY_ICON_OPTIONS.map((ic) => (
                <option key={ic} value={ic}>
                  {ic}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cat-color" className="block text-xs text-[#C8CEC7]">
              Accent Color
            </label>
            <input
              id="cat-color"
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[#26352E] bg-[#090D0C] p-1"
            />
          </div>
          <div>
            <label htmlFor="cat-vis" className="block text-xs text-[#C8CEC7]">
              Visibility
            </label>
            <select
              id="cat-vis"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-2.5 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="PUBLIC">PUBLIC</option>
              <option value="HIDDEN">HIDDEN</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="cat-cover" className="block text-xs text-[#C8CEC7]">
            Cover Image URL (Optional)
          </label>
          <input
            id="cat-cover"
            type="text"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="/src/assets/images/..."
            className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
          />
        </div>

        <div className="border-t border-[#1D2823] pt-3">
          <p className="text-xs font-medium text-[#C8CEC7]">Rank & Custom Role Access Rules</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ruleTargets.map((target) => (
              <div key={target.id}>
                <label className="block truncate text-[11px] text-[#8D968F]">{target.label}</label>
                <select
                  aria-label={`Category access for ${target.id}`}
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
          {editingId ? t.admin.saveChanges : t.admin.createCategory}
        </button>
      </form>

      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6 lg:col-span-7">
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {t.admin.menu.categories} ({categories.length})
        </h2>
        <p className="mt-1 text-xs text-[#8D968F]">
          {lang === 'tr'
            ? 'Ana kategorileri oluşturun, sıralayın ve düzenleyin. Alt kategoriler için "Subcategories" bölümünü kullanın.'
            : 'Create, order, and configure top-level categories. Use "Subcategories" for child groups.'}
        </p>

        {categories.length === 0 ? (
          <p className="mt-6 text-sm text-[#8D968F]">
            {lang === 'tr'
              ? 'Henüz kategori oluşturulmadı. Soldaki formdan ilk kategoriyi oluşturun.'
              : 'No categories created yet. Use the form on the left to create the first category.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[#1D2823]">
            {categories.map((c, idx) => {
              const subCount = allItems.filter((x) => x.parentId === c.id).length;
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <CategoryIcon name={c.icon} color={c.accentColor} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#E9E7DF]">
                        {lang === 'tr' ? c.nameTr : c.nameEn}
                      </p>
                      <p className="font-mono text-[11px] text-[#8D968F] tabular-nums">
                        /{c.slug} · {c.visibility} · {subCount} sub · {c.archiveCount} archives
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void moveOrder(idx, -1)}
                      className="rounded border border-[#26352E] p-1.5 text-[#A9AEA7] disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === categories.length - 1}
                      onClick={() => void moveOrder(idx, 1)}
                      className="rounded border border-[#26352E] p-1.5 text-[#A9AEA7] disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="rounded border border-[#26352E] px-2.5 py-1 text-xs text-[#E9E7DF] hover:border-[#B89B63]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleArchiveVisibility(c)}
                      className="rounded border border-[#26352E] p-1.5 text-[#A9AEA7] hover:text-[#E9E7DF]"
                      title={c.visibility === 'ARCHIVED' ? 'Restore' : 'Archive'}
                    >
                      {c.visibility === 'ARCHIVED' ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      className="rounded border border-[#26352E] p-1.5 text-[#E58A82] hover:border-[#9E3B33]"
                      aria-label={`Delete ${c.slug}`}
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
