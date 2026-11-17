import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { resolveLocalizedText } from '../../shared/i18n';
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_MEMBER_RANKS,
  CategoryDTO,
  PermissionKey,
  PermissionResolutionResult,
  RoleDTO,
  UserSummaryDTO,
} from '../../shared/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface PermissionDef {
  key: PermissionKey;
  group_name: string;
  label_tr: string;
  label_en: string;
  description_tr: string;
  description_en: string;
}

interface OverrideRow {
  id: string;
  user_id: string;
  username: string;
  rank: string;
  scope: 'GLOBAL' | 'CATEGORY' | 'ARCHIVE';
  target_id: string | null;
  permission_key: string | null;
  effect: 'ALLOW' | 'DENY';
  reason: string;
  created_at: string;
}

export function AdminPermissionsSection() {
  const { lang, t } = useApp();
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [permissions, setPermissions] = useState<PermissionDef[]>([]);
  const [savedMatrix, setSavedMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [draftMatrix, setDraftMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [users, setUsers] = useState<UserSummaryDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [archives, setArchives] = useState<Array<{ id: string; titleTr: string; titleEn: string }>>([]);

  // Custom role creator state
  const [roleNameTr, setRoleNameTr] = useState('');
  const [roleNameEn, setRoleNameEn] = useState('');
  const [roleColor, setRoleColor] = useState('#7E9F8B');
  const [roleDescEn, setRoleDescEn] = useState('');

  // Override form state
  const [ovrUserId, setOvrUserId] = useState('');
  const [ovrScope, setOvrScope] = useState<'GLOBAL' | 'CATEGORY' | 'ARCHIVE'>('ARCHIVE');
  const [ovrTargetId, setOvrTargetId] = useState('');
  const [ovrPermKey, setOvrPermKey] = useState<string>('');
  const [ovrEffect, setOvrEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [ovrReason, setOvrReason] = useState('');

  // Simulator state
  const [simUserId, setSimUserId] = useState('');
  const [simPerm, setSimPerm] = useState<PermissionKey>('view_archives');
  const [simCatId, setSimCatId] = useState('');
  const [simSubcatId, setSimSubcatId] = useState('');
  const [simArcId, setSimArcId] = useState('');
  const [simResult, setSimResult] = useState<PermissionResolutionResult | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'role'; role: RoleDTO } | { kind: 'override'; override: OverrideRow } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [permRes, rolesRes, usrRes, catRes, arcRes] = await Promise.all([
        apiRequest<any>('/api/admin/permissions'),
        apiRequest<{ roles: RoleDTO[] }>('/api/admin/roles').catch(() => ({ roles: [] })),
        apiRequest<{ users: UserSummaryDTO[] }>('/api/admin/users').catch(() => ({ users: [] })),
        apiRequest<{ categories: CategoryDTO[] }>('/api/admin/categories').catch(() => ({
          categories: [],
        })),
        apiRequest<{ archives: any[] }>('/api/admin/archives').catch(() => ({ archives: [] })),
      ]);
      setRoles(rolesRes.roles || []);
      setPermissions(permRes.permissions || []);
      setSavedMatrix(permRes.matrix || {});
      setDraftMatrix(JSON.parse(JSON.stringify(permRes.matrix || {})));
      setOverrides(permRes.overrides || []);
      setUsers(usrRes.users || []);
      setCategories(catRes.categories || []);
      setArchives(arcRes.archives || []);
      if (usrRes.users?.length && !ovrUserId) {
        setOvrUserId(usrRes.users[0].id);
        setSimUserId(usrRes.users[0].id);
      }
    } catch {
      // ignore
    }
  }, [ovrUserId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const configurableColumns: Array<{
    id: string;
    label: string;
    color?: string;
    isCustom: boolean;
  }> = [
    ...ASSIGNABLE_MEMBER_RANKS.map((r) => ({
      id: r,
      label: t.ranks[r],
      isCustom: false,
    })),
    ...roles
      .filter((r) => !r.isSystemRank && !r.isAdminRole)
      .map((r) => ({
        id: r.id,
        label: resolveLocalizedText(r.displayNameTr, r.displayNameEn, lang),
        color: r.color,
        isCustom: true,
      })),
  ];

  const customRoles = roles.filter((r) => !r.isSystemRank && !r.isAdminRole);
  const hasUnsaved = JSON.stringify(savedMatrix) !== JSON.stringify(draftMatrix);

  const toggleCell = (roleId: string, perm: string) => {
    setDraftMatrix((prev) => ({
      ...prev,
      [roleId]: {
        ...(prev[roleId] || {}),
        [perm]: !prev[roleId]?.[perm],
      },
    }));
  };

  const setBulkRole = (roleId: string, value: boolean) => {
    setDraftMatrix((prev) => {
      const nextRole: Record<string, boolean> = {};
      for (const p of ALL_PERMISSIONS) nextRole[p] = value;
      return { ...prev, [roleId]: nextRole };
    });
  };

  const saveMatrix = async () => {
    setErr('');
    setMsg('');
    try {
      await apiRequest('/api/admin/permissions/matrix', {
        method: 'PUT',
        body: JSON.stringify({ matrix: draftMatrix }),
      });
      setSavedMatrix(JSON.parse(JSON.stringify(draftMatrix)));
      setMsg(
        lang === 'tr'
          ? 'Rol izin matrisi atomik olarak kaydedildi.'
          : 'Role permission matrix saved atomically.'
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const createCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          displayNameTr: roleNameTr,
          displayNameEn: roleNameEn || roleNameTr,
          color: roleColor,
          descriptionEn: roleDescEn,
          descriptionTr: roleDescEn,
          permissions: { view_archives: true, search_archives: true },
        }),
      });
      setRoleNameTr('');
      setRoleNameEn('');
      setRoleDescEn('');
      setMsg(lang === 'tr' ? 'Özel rol oluşturuldu.' : 'Custom role created.');
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create custom role');
    }
  };

  const executeConfirmedDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    setErr('');
    try {
      if (confirmDelete.kind === 'role') {
        await apiRequest(`/api/admin/roles/${confirmDelete.role.id}`, { method: 'DELETE' });
        setMsg(lang === 'tr' ? 'Özel rol silindi.' : 'Custom role deleted.');
      } else {
        await apiRequest(`/api/admin/overrides/${confirmDelete.override.id}`, {
          method: 'DELETE',
        });
        setMsg(lang === 'tr' ? 'Kullanıcı istisnası kaldırıldı.' : 'User override removed.');
      }
      setConfirmDelete(null);
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const createOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiRequest('/api/admin/overrides', {
        method: 'POST',
        body: JSON.stringify({
          userId: ovrUserId,
          scope: ovrScope,
          targetId: ovrScope === 'GLOBAL' ? null : ovrTargetId || null,
          permissionKey: ovrPermKey || null,
          effect: ovrEffect,
          reason: ovrReason,
        }),
      });
      setOvrReason('');
      setMsg(lang === 'tr' ? 'Kullanıcı istisna kuralı eklendi.' : 'User permission exception added.');
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create override');
    }
  };

  const runSimulation = async () => {
    if (!simUserId) return;
    try {
      const res = await apiRequest<{ result: PermissionResolutionResult }>(
        '/api/admin/permissions/simulate',
        {
          method: 'POST',
          body: JSON.stringify({
            userId: simUserId,
            permission: simPerm,
            categoryId: simCatId || null,
            subcategoryId: simSubcatId || null,
            archiveId: simArcId || null,
          }),
        }
      );
      setSimResult(res.result);
    } catch {
      // ignore
    }
  };

  const topCategories = categories.filter((c) => !c.parentId);
  const simSubcategories = categories.filter((c) => c.parentId && (!simCatId || c.parentId === simCatId));

  return (
    <div className="space-y-8">
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.kind === 'role'
            ? lang === 'tr'
              ? 'Özel Rolü Sil'
              : 'Delete Custom Role'
            : lang === 'tr'
            ? 'İstisna Kuralını Kaldır'
            : 'Remove User Override'
        }
        message={
          confirmDelete?.kind === 'role'
            ? lang === 'tr'
              ? `"${confirmDelete.role.displayNameTr}" özel rolünü silmek istediğinize emin misiniz?`
              : `Delete custom role "${confirmDelete.role.displayNameEn}"?`
            : confirmDelete?.kind === 'override'
            ? lang === 'tr'
              ? `${confirmDelete.override.username} için tanımlı ${confirmDelete.override.effect} istisnası silinsin mi?`
              : `Remove ${confirmDelete.override.effect} exception for ${confirmDelete.override.username}?`
            : ''
        }
        danger
        busy={busy}
        onConfirm={() => void executeConfirmedDelete()}
        onCancel={() => setConfirmDelete(null)}
      />

      <div className="rounded-lg border border-[#223029] bg-[#101715] p-5 text-xs text-[#A9AEA7]">
        <p className="font-medium text-[#E9E7DF]">
          {lang === 'tr'
            ? 'Yetkilendirme Öncelik Sırası & Birleşik Admin Kontrolü'
            : 'Permission Precedence Order & Unified Admin Control'}
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-[#B89B63]">
          1. Unified ADMIN → 2. User Override (Explicit DENY Holds) → 3. Archive Rule → 4. Subcategory Rule → 5. Category Rule → 6. Role Matrix (Rank + Custom Roles) → 7. Default Deny
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-[#557B67]/60 bg-[#15241D] px-4 py-2.5 text-xs text-[#D6EAE0]">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-2.5 text-xs text-[#F3D1CE]">
          {err}
        </div>
      )}

      {/* Custom Roles Creator & Directory */}
      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={createCustomRole} className="space-y-3 lg:col-span-5">
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {lang === 'tr' ? 'Özel Rol Oluştur (Discord Modeli)' : 'Create Custom Role'}
            </h2>
            <p className="text-xs text-[#8D968F]">
              {lang === 'tr'
                ? 'Temel 4 rütbe (Üye, Destekçi, İşletme, Admin) korunur; özel roller alan bazlı ek yetki veya kısıt sunar.'
                : 'Fundamental ranks stay intact; custom roles provide additional domain-level capabilities.'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                value={roleNameTr}
                onChange={(e) => setRoleNameTr(e.target.value)}
                placeholder={lang === 'tr' ? 'Rol Adı (TR)' : 'Role Name (TR)'}
                className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              />
              <input
                type="text"
                required
                value={roleNameEn}
                onChange={(e) => setRoleNameEn(e.target.value)}
                placeholder={lang === 'tr' ? 'Rol Adı (EN)' : 'Role Name (EN)'}
                className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="Role color"
                value={roleColor}
                onChange={(e) => setRoleColor(e.target.value)}
                className="h-9 w-14 rounded border border-[#26352E] bg-[#090D0C] p-1"
              />
              <input
                type="text"
                value={roleDescEn}
                onChange={(e) => setRoleDescEn(e.target.value)}
                placeholder={lang === 'tr' ? 'Rol açıklaması...' : 'Role description...'}
                className="flex-1 rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{lang === 'tr' ? 'Özel Rol Ekle' : 'Create Role'}</span>
            </button>
          </form>

          <div className="border-t border-[#1D2823] pt-4 lg:col-span-7 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B89B63]">
              {lang === 'tr' ? 'Aktif Özel Roller' : 'Active Custom Roles'} ({customRoles.length})
            </h3>
            {customRoles.length === 0 ? (
              <p className="mt-3 text-xs text-[#8D968F]">
                {lang === 'tr'
                  ? 'Henüz özel rol tanımlanmadı. Soldan ilk özel rolü oluşturabilirsiniz.'
                  : 'No custom roles defined yet.'}
              </p>
            ) : (
              <div className="mt-3 divide-y divide-[#1D2823]">
                {customRoles.map((cr) => (
                  <div key={cr.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: cr.color }}
                      />
                      <div>
                        <p className="font-medium text-[#E9E7DF]">
                          {cr.displayNameTr} / {cr.displayNameEn}
                        </p>
                        <p className="font-mono text-[10px] text-[#8D968F]">
                          {cr.id} · {cr.memberCount ?? 0} member(s)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete({ kind: 'role', role: cr })}
                      className="text-[#8D968F] hover:text-[#E58A82]"
                      aria-label={`Delete role ${cr.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Discord-style Role Permission Matrix */}
      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1D2823] pb-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {t.admin.menu.permissions}
            </h2>
            <p className="mt-1 text-xs text-[#8D968F]">
              {lang === 'tr'
                ? 'Değişiklikler "Değişiklikleri Kaydet" butonuna basılmadan uygulanmaz.'
                : 'Changes are staged and only applied once saved.'}
            </p>
          </div>
          {hasUnsaved && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDraftMatrix(JSON.parse(JSON.stringify(savedMatrix)))}
                className="rounded-md border border-[#2B3932] px-4 py-2 text-xs text-[#A9AEA7]"
              >
                {t.admin.discardChanges}
              </button>
              <button
                type="button"
                onClick={() => void saveMatrix()}
                className="rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C]"
              >
                {t.admin.saveChanges}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#223029] text-[#8D968F]">
                <th className="py-3 pr-4 font-medium">Permission</th>
                {configurableColumns.map((col) => (
                  <th key={col.id} className="px-4 py-3 text-center font-medium">
                    <div
                      className="text-[#E9E7DF]"
                      style={col.color ? { color: col.color } : undefined}
                    >
                      {col.label}
                    </div>
                    <div className="mt-1 flex justify-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setBulkRole(col.id, true)}
                        className="text-[#557B67] hover:underline"
                      >
                        All On
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkRole(col.id, false)}
                        className="text-[#8D968F] hover:underline"
                      >
                        All Off
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2823]">
              {permissions.map((p) => (
                <tr key={p.key} className="hover:bg-[#151E1A]/60">
                  <td className="py-3.5 pr-4">
                    <p className="font-medium text-[#E9E7DF]">
                      {lang === 'tr' ? p.label_tr : p.label_en}
                    </p>
                    <p className="text-[11px] text-[#8D968F]">
                      {lang === 'tr' ? p.description_tr : p.description_en}
                    </p>
                  </td>
                  {configurableColumns.map((col) => {
                    const enabled = Boolean(draftMatrix[col.id]?.[p.key]);
                    return (
                      <td key={col.id} className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`${col.label} ${p.key}`}
                          onClick={() => toggleCell(col.id, p.key)}
                          className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                            enabled ? 'bg-[#557B67]' : 'bg-[#212D27]'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full bg-[#E9E7DF] transition-transform ${
                              enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* User-Specific Overrides & Conflict Simulator */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section className="rounded-xl border border-[#223029] bg-[#101715] p-6 lg:col-span-7">
          <h3 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {lang === 'tr' ? 'Kullanıcı Bazlı İstisna İzinleri' : 'User-Specific Permission Exceptions'}
          </h3>
          <form onSubmit={createOverride} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              aria-label="Target user"
              value={ovrUserId}
              onChange={(e) => setOvrUserId(e.target.value)}
              className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.rank})
                </option>
              ))}
            </select>
            <select
              aria-label="Override scope"
              value={ovrScope}
              onChange={(e) => {
                setOvrScope(e.target.value as any);
                setOvrTargetId('');
              }}
              className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="ARCHIVE">ARCHIVE</option>
              <option value="CATEGORY">CATEGORY</option>
              <option value="GLOBAL">GLOBAL</option>
            </select>

            {ovrScope === 'CATEGORY' && (
              <select
                aria-label="Target category"
                value={ovrTargetId}
                onChange={(e) => setOvrTargetId(e.target.value)}
                required
                className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              >
                <option value="">Select category or subcategory…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? '↳ ' : ''}
                    {resolveLocalizedText(c.nameTr, c.nameEn, lang)}
                  </option>
                ))}
              </select>
            )}

            {ovrScope === 'ARCHIVE' && (
              <select
                aria-label="Target archive"
                value={ovrTargetId}
                onChange={(e) => setOvrTargetId(e.target.value)}
                required
                className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              >
                <option value="">Select archive…</option>
                {archives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {resolveLocalizedText(a.titleTr, a.titleEn, lang)}
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Permission key"
              value={ovrPermKey}
              onChange={(e) => setOvrPermKey(e.target.value)}
              className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="">All Permissions in Scope</option>
              {ALL_PERMISSIONS.map((pk) => (
                <option key={pk} value={pk}>
                  {pk}
                </option>
              ))}
            </select>

            <select
              aria-label="Override effect"
              value={ovrEffect}
              onChange={(e) => setOvrEffect(e.target.value as any)}
              className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="ALLOW">ALLOW (Grant Exception)</option>
              <option value="DENY">DENY (Block Exception)</option>
            </select>

            <input
              type="text"
              value={ovrReason}
              onChange={(e) => setOvrReason(e.target.value)}
              placeholder="Reason / Note"
              className="rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF] sm:col-span-2"
            />
            <button
              type="submit"
              className="rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C] sm:col-span-2"
            >
              Add User Exception
            </button>
          </form>

          <div className="mt-5 divide-y divide-[#1D2823] border-t border-[#1D2823]">
            {overrides.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <p className="text-[#E9E7DF]">
                    <strong>{o.username}</strong> ·{' '}
                    <span className={o.effect === 'ALLOW' ? 'text-[#557B67]' : 'text-[#E58A82]'}>
                      {o.effect}
                    </span>{' '}
                    · {o.scope}
                    {o.permission_key ? ` (${o.permission_key})` : ''}
                  </p>
                  {o.reason && <p className="text-[11px] text-[#8D968F]">{o.reason}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ kind: 'override', override: o })}
                  className="text-[#8D968F] hover:text-[#E58A82]"
                  aria-label="Delete override"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Live Precedence Trace Simulator */}
        <section className="rounded-xl border border-[#223029] bg-[#101715] p-6 lg:col-span-5">
          <h3 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {lang === 'tr' ? 'İzin Çözümleme Simülatörü' : 'Resolution Trace Simulator'}
          </h3>
          <div className="mt-4 space-y-3">
            <select
              aria-label="Simulate user"
              value={simUserId}
              onChange={(e) => setSimUserId(e.target.value)}
              className="w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.rank})
                </option>
              ))}
            </select>
            <select
              aria-label="Simulate permission"
              value={simPerm}
              onChange={(e) => setSimPerm(e.target.value as PermissionKey)}
              className="w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              {ALL_PERMISSIONS.map((pk) => (
                <option key={pk} value={pk}>
                  {pk}
                </option>
              ))}
            </select>
            <select
              aria-label="Simulate category"
              value={simCatId}
              onChange={(e) => {
                setSimCatId(e.target.value);
                setSimSubcatId('');
              }}
              className="w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="">No Category Context</option>
              {topCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {resolveLocalizedText(c.nameTr, c.nameEn, lang)}
                </option>
              ))}
            </select>
            <select
              aria-label="Simulate subcategory"
              value={simSubcatId}
              onChange={(e) => setSimSubcatId(e.target.value)}
              className="w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="">No Subcategory Context</option>
              {simSubcategories.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {resolveLocalizedText(sc.nameTr, sc.nameEn, lang)}
                </option>
              ))}
            </select>
            <select
              aria-label="Simulate archive"
              value={simArcId}
              onChange={(e) => setSimArcId(e.target.value)}
              className="w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            >
              <option value="">No Archive Context</option>
              {archives.map((a) => (
                <option key={a.id} value={a.id}>
                  {resolveLocalizedText(a.titleTr, a.titleEn, lang)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void runSimulation()}
              className="w-full rounded-md border border-[#B89B63]/60 bg-[#151E1A] py-2 text-xs font-semibold text-[#B89B63]"
            >
              Evaluate Effective Access
            </button>
          </div>

          {simResult && (
            <div className="mt-5 rounded-md border border-[#26352E] bg-[#090D0C] p-4 text-xs">
              <p className="font-mono font-semibold">
                Result:{' '}
                <span className={simResult.allowed ? 'text-[#557B67]' : 'text-[#E58A82]'}>
                  {simResult.allowed ? 'ALLOWED' : 'DENIED'}
                </span>
              </p>
              <p className="mt-1 text-[#A9AEA7]">
                Decided by: <span className="font-mono text-[#B89B63]">{simResult.decidedBy}</span>
              </p>
              <p className="mt-0.5 text-[#8D968F]">{simResult.reason}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
