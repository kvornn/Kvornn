import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle, Eye, LogOut, Shield, Tags } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { resolveLocalizedText } from '../../shared/i18n';
import {
  ASSIGNABLE_MEMBER_RANKS,
  RoleDTO,
  UserRank,
  UserSummaryDTO,
} from '../../shared/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type ConfirmActionState =
  | { kind: 'rank'; user: UserSummaryDTO; nextRank: Exclude<UserRank, 'ADMIN'> }
  | { kind: 'roles'; user: UserSummaryDTO; roleIds: string[] }
  | {
      kind: 'ban';
      user: UserSummaryDTO;
      banType: 'TEMPORARY' | 'PERMANENT' | 'SUSPENSION';
      durationHours: number;
    }
  | { kind: 'unban'; user: UserSummaryDTO }
  | { kind: 'revoke'; user: UserSummaryDTO }
  | null;

export function AdminUsersSection() {
  const { user: actor, lang, t } = useApp();
  const [users, setUsers] = useState<UserSummaryDTO[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleDTO[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSummaryDTO | null>(null);
  const [profileUser, setProfileUser] = useState<UserSummaryDTO | null>(null);

  const [rankChoice, setRankChoice] = useState<Exclude<UserRank, 'ADMIN'>>('UYE');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const [banType, setBanType] = useState<'TEMPORARY' | 'PERMANENT' | 'SUSPENSION'>('TEMPORARY');
  const [banHours, setBanHours] = useState(24);

  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [usrRes, roleRes, banRes] = await Promise.all([
        apiRequest<{ users: UserSummaryDTO[] }>('/api/admin/users'),
        apiRequest<{ roles: RoleDTO[] }>('/api/admin/roles').catch(() => ({ roles: [] })),
        apiRequest<{ bans: any[] }>('/api/admin/bans').catch(() => ({ bans: [] })),
      ]);
      setUsers(usrRes.users || []);
      setCustomRoles((roleRes.roles || []).filter((r) => !r.isSystemRank && !r.isAdminRole));
      setBans(banRes.bans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const executeConfirmedAction = async (reason: string) => {
    if (!confirmAction) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      if (confirmAction.kind === 'rank') {
        await apiRequest(`/api/admin/users/${confirmAction.user.id}/rank`, {
          method: 'POST',
          body: JSON.stringify({ rank: confirmAction.nextRank, reason }),
        });
        setFeedback(`Updated rank for ${confirmAction.user.username} to ${confirmAction.nextRank}`);
      } else if (confirmAction.kind === 'roles') {
        await apiRequest(`/api/admin/users/${confirmAction.user.id}/roles`, {
          method: 'PUT',
          body: JSON.stringify({ roleIds: confirmAction.roleIds, reason }),
        });
        setFeedback(`Updated custom roles for ${confirmAction.user.username}`);
      } else if (confirmAction.kind === 'ban') {
        await apiRequest(`/api/admin/users/${confirmAction.user.id}/ban`, {
          method: 'POST',
          body: JSON.stringify({
            banType: confirmAction.banType,
            durationHours: confirmAction.durationHours,
            reason,
          }),
        });
        setFeedback(`Applied ${confirmAction.banType} sanction to ${confirmAction.user.username}`);
      } else if (confirmAction.kind === 'unban') {
        await apiRequest(`/api/admin/users/${confirmAction.user.id}/unban`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        setFeedback(`Reactivated account ${confirmAction.user.username}`);
      } else if (confirmAction.kind === 'revoke') {
        const res = await apiRequest<{ revokedCount: number }>(
          `/api/admin/users/${confirmAction.user.id}/revoke-sessions`,
          { method: 'POST' }
        );
        setFeedback(`Terminated ${res.revokedCount} session(s) for ${confirmAction.user.username}`);
      }
      setConfirmAction(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleCustomRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.rank.toLowerCase().includes(q) ||
      u.keyType.toLowerCase().includes(q) ||
      (u.customRoles || []).some(
        (cr) =>
          cr.displayNameTr.toLowerCase().includes(q) ||
          cr.displayNameEn.toLowerCase().includes(q)
      )
    );
  });

  const confirmDialogConfig = (() => {
    if (!confirmAction) return null;
    switch (confirmAction.kind) {
      case 'rank':
        return {
          title: lang === 'tr' ? 'Rütbe Değişikliği' : 'Change Member Rank',
          message:
            lang === 'tr'
              ? `${confirmAction.user.username} kullanıcısının rütbesini ${confirmAction.nextRank} olarak güncellemek için denetim gerekçesi girin.`
              : `Enter an audit reason to update ${confirmAction.user.username}'s rank to ${confirmAction.nextRank}.`,
          danger: false,
          requireReason: true,
          minReasonLength: 3,
        };
      case 'roles':
        return {
          title: lang === 'tr' ? 'Özel Rolleri Kaydet' : 'Save Custom Roles',
          message:
            lang === 'tr'
              ? `${confirmAction.user.username} için özel rol atamalarını güncellemek için gerekçe girin.`
              : `Provide a reason to update custom role assignments for ${confirmAction.user.username}.`,
          danger: false,
          requireReason: true,
          minReasonLength: 3,
        };
      case 'ban':
        return {
          title: lang === 'tr' ? 'Yaptırım / Yasaklama Uygula' : 'Apply Account Sanction',
          message:
            lang === 'tr'
              ? `${confirmAction.user.username} hesabına ${confirmAction.banType} yaptırımı uygulanacak ve tüm oturumları sonlandırılacaktır.`
              : `This will apply ${confirmAction.banType} to ${confirmAction.user.username} and revoke all active sessions.`,
          danger: true,
          requireReason: true,
          minReasonLength: 5,
        };
      case 'unban':
        return {
          title: lang === 'tr' ? 'Hesabı Yeniden Etkinleştir' : 'Reactivate Account',
          message:
            lang === 'tr'
              ? `${confirmAction.user.username} hesabındaki aktif yasaklamayı kaldırmak için gerekçe girin.`
              : `Enter a reason to lift the active sanction and restore ${confirmAction.user.username}.`,
          danger: false,
          requireReason: true,
          minReasonLength: 3,
        };
      case 'revoke':
        return {
          title: lang === 'tr' ? 'Tüm Oturumları Sonlandır' : 'Terminate Active Sessions',
          message:
            lang === 'tr'
              ? `${confirmAction.user.username} kullanıcısının tüm aktif oturumları kapatılacak.`
              : `Revoke all active authenticated sessions for ${confirmAction.user.username}?`,
          danger: true,
          requireReason: false,
          minReasonLength: 0,
        };
    }
  })();

  return (
    <div className="space-y-8">
      <ConfirmDialog
        open={Boolean(confirmDialogConfig)}
        title={confirmDialogConfig?.title || ''}
        message={confirmDialogConfig?.message || ''}
        danger={confirmDialogConfig?.danger}
        requireReason={confirmDialogConfig?.requireReason}
        minReasonLength={confirmDialogConfig?.minReasonLength}
        busy={busy}
        onConfirm={(r) => void executeConfirmedAction(r)}
        onCancel={() => setConfirmAction(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            lang === 'tr' ? 'Kullanıcı adı, rütbe veya rol ara...' : 'Search username, rank, or role...'
          }
          className="w-full max-w-sm rounded-md border border-[#26352E] bg-[#101715] px-4 py-2 text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
        />
        <span className="font-mono text-xs text-[#8D968F] tabular-nums">
          {filtered.length} / {users.length}
        </span>
      </div>

      {feedback && (
        <div className="rounded-md border border-[#557B67]/60 bg-[#15241D] px-4 py-2.5 text-xs text-[#D6EAE0]">
          {feedback}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-2.5 text-xs text-[#F3D1CE]"
        >
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[#223029] bg-[#101715]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#223029] text-[#8D968F]">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Rank & Custom Roles</th>
              <th className="px-4 py-3 font-medium">Key Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Sessions</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1D2823]">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-[#151E1A]/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-[#E9E7DF]">{u.username}</p>
                  <p className="font-mono text-[10px] text-[#6F7871]">{u.id}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-[#B89B63]">
                    {t.ranks[u.rank]}
                    {u.adminProfile ? ` (${u.adminProfile})` : ''}
                  </span>
                  {u.customRoles && u.customRoles.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2.5">
                      {u.customRoles.map((cr) => (
                        <span
                          key={cr.id}
                          className="inline-flex items-center gap-1 text-[11px]"
                          style={{ color: cr.color || '#E9E7DF' }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: cr.color || '#B89B63' }}
                          />
                          {resolveLocalizedText(cr.displayNameTr, cr.displayNameEn, lang)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#8D968F]">{u.keyType}</td>
                <td className="px-4 py-3 font-mono">
                  <span className={u.status === 'ACTIVE' ? 'text-[#557B67]' : 'text-[#E58A82]'}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[#E9E7DF]">
                  {u.activeSessions}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setProfileUser(u)}
                      className="rounded border border-[#2B3932] p-1 text-[#A9AEA7] hover:text-[#E9E7DF]"
                      title="Inspect Profile"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {u.id !== actor?.id && u.rank !== 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setRankChoice(u.rank as Exclude<UserRank, 'ADMIN'>);
                          setSelectedRoleIds((u.customRoles || []).map((cr) => cr.id));
                        }}
                        className="rounded border border-[#2B3932] px-2.5 py-1 text-[11px] text-[#E9E7DF] hover:border-[#B89B63]"
                      >
                        <Shield className="mr-1 inline h-3 w-3" />
                        Manage
                      </button>
                    )}
                    {u.status !== 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ kind: 'unban', user: u })}
                        className="rounded border border-[#557B67]/60 px-2.5 py-1 text-[11px] text-[#D6EAE0]"
                      >
                        <CheckCircle className="mr-1 inline h-3 w-3" />
                        Reactivate
                      </button>
                    )}
                    {(u.id === actor?.id || u.rank !== 'ADMIN') && (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ kind: 'revoke', user: u })}
                        className="rounded border border-[#2B3932] px-2 py-1 text-[11px] text-[#A9AEA7] hover:text-[#E9E7DF]"
                        title="Revoke active sessions"
                      >
                        <LogOut className="inline h-3 w-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {profileUser && (
        <div className="rounded-xl border border-[#26352E] bg-[#101715] p-6 text-xs">
          <div className="flex items-center justify-between border-b border-[#1D2823] pb-3">
            <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
              {profileUser.username}
            </h3>
            <button
              type="button"
              onClick={() => setProfileUser(null)}
              className="text-[#8D968F] hover:text-[#E9E7DF]"
            >
              ✕
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-[#8D968F]">Rank</dt>
              <dd className="mt-1 font-medium text-[#B89B63]">{t.ranks[profileUser.rank]}</dd>
            </div>
            <div>
              <dt className="text-[#8D968F]">Key Type</dt>
              <dd className="mt-1 font-mono text-[#E9E7DF]">
                {profileUser.keyType} (Hashed · Unreadable)
              </dd>
            </div>
            <div>
              <dt className="text-[#8D968F]">MFA</dt>
              <dd className="mt-1 font-mono text-[#E9E7DF]">
                {profileUser.mfaEnabled ? 'ENABLED' : 'OFF'}
              </dd>
            </div>
            <div>
              <dt className="text-[#8D968F]">Created</dt>
              <dd className="mt-1 font-mono text-[#A9AEA7]">
                {new Date(profileUser.createdAt).toLocaleDateString(
                  lang === 'tr' ? 'tr-TR' : 'en-US'
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {selectedUser && (
        <div className="grid grid-cols-1 gap-6 rounded-xl border border-[#B89B63]/40 bg-[#101715] p-6 lg:grid-cols-3">
          {/* Fundamental Rank */}
          <div className="space-y-4">
            <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
              Rank — {selectedUser.username}
            </h3>
            <div>
              <label htmlFor="admin-rank-select" className="block text-xs text-[#C8CEC7]">
                Target Rank
              </label>
              <select
                id="admin-rank-select"
                value={rankChoice}
                onChange={(e) => setRankChoice(e.target.value as Exclude<UserRank, 'ADMIN'>)}
                className="mt-1.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-sm text-[#E9E7DF]"
              >
                {ASSIGNABLE_MEMBER_RANKS.map((r) => (
                  <option key={r} value={r}>
                    {t.ranks[r]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() =>
                setConfirmAction({ kind: 'rank', user: selectedUser, nextRank: rankChoice })
              }
              className="rounded-md bg-[#B89B63] px-4 py-2 text-xs font-semibold text-[#090D0C]"
            >
              Update Rank
            </button>
          </div>

          {/* Custom Roles Assignment */}
          <div className="space-y-4 border-t border-[#1D2823] pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
              <Tags className="mr-1.5 inline h-4 w-4 text-[#B89B63]" />
              {lang === 'tr' ? 'Özel Roller' : 'Custom Roles'}
            </h3>
            {customRoles.length === 0 ? (
              <p className="text-xs text-[#8D968F]">
                {lang === 'tr'
                  ? 'Henüz özel rol oluşturulmadı. Roller bölümünden ekleyin.'
                  : 'No custom roles defined yet. Create roles in Roles & Permissions.'}
              </p>
            ) : (
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {customRoles.map((cr) => {
                  const checked = selectedRoleIds.includes(cr.id);
                  return (
                    <label
                      key={cr.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCustomRole(cr.id)}
                        className="accent-[#B89B63]"
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cr.color }}
                      />
                      <span>{resolveLocalizedText(cr.displayNameTr, cr.displayNameEn, lang)}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                setConfirmAction({
                  kind: 'roles',
                  user: selectedUser,
                  roleIds: selectedRoleIds,
                })
              }
              className="rounded-md border border-[#B89B63]/70 bg-[#151E1A] px-4 py-2 text-xs font-semibold text-[#B89B63]"
            >
              Save Custom Roles
            </button>
          </div>

          {/* Sanction / Freeze / Ban */}
          <div className="space-y-4 border-t border-[#1D2823] pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <h3 className="font-display text-xl font-semibold text-[#E58A82]">
              <Ban className="mr-1.5 inline h-4 w-4" />
              Sanction & Freeze
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="admin-ban-type" className="block text-xs text-[#C8CEC7]">
                  Type
                </label>
                <select
                  id="admin-ban-type"
                  value={banType}
                  onChange={(e) => setBanType(e.target.value as any)}
                  className="mt-1.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-sm text-[#E9E7DF]"
                >
                  <option value="SUSPENSION">Freeze / Suspend</option>
                  <option value="TEMPORARY">Temporary Ban</option>
                  <option value="PERMANENT">Permanent Ban</option>
                </select>
              </div>
              {banType === 'TEMPORARY' && (
                <div>
                  <label htmlFor="admin-ban-hours" className="block text-xs text-[#C8CEC7]">
                    Hours
                  </label>
                  <input
                    id="admin-ban-hours"
                    type="number"
                    min={1}
                    value={banHours}
                    onChange={(e) => setBanHours(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 font-mono text-sm text-[#E9E7DF]"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setConfirmAction({
                    kind: 'ban',
                    user: selectedUser,
                    banType,
                    durationHours: banHours,
                  })
                }
                className="rounded-md bg-[#9E3B33] px-4 py-2 text-xs font-semibold text-white"
              >
                Apply Sanction
              </button>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-xs text-[#8D968F] hover:text-[#E9E7DF]"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active & Historical Sanctions Ledger */}
      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6">
        <h3 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {lang === 'tr' ? 'Yaptırım ve Yasaklama Geçmişi' : 'Sanctions & Ban Ledger'} ({bans.length})
        </h3>
        {bans.length === 0 ? (
          <p className="mt-4 text-xs text-[#8D968F]">
            {lang === 'tr' ? 'Kayıtlı yaptırım bulunmuyor.' : 'No account sanctions recorded.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[#1D2823] border-t border-[#1D2823]">
            {bans.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-4 py-3.5 text-xs"
              >
                <div>
                  <p className="font-medium text-[#E9E7DF]">
                    {b.username} · <span className="font-mono text-[#E58A82]">{b.ban_type}</span> ·{' '}
                    <span className={b.active ? 'text-[#E58A82]' : 'text-[#557B67]'}>
                      {b.active ? 'ACTIVE' : 'LIFTED'}
                    </span>
                  </p>
                  <p className="mt-1 text-[#A9AEA7]">{b.reason}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#8D968F] tabular-nums">
                    Issued by {b.issued_by_name || 'ADMIN'} ·{' '}
                    {new Date(b.created_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                    {b.expires_at
                      ? ` · Expires ${new Date(b.expires_at).toLocaleString(
                          lang === 'tr' ? 'tr-TR' : 'en-US'
                        )}`
                      : ''}
                  </p>
                </div>
                {b.active === 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        kind: 'unban',
                        user: {
                          id: b.user_id,
                          username: b.username,
                        } as UserSummaryDTO,
                      })
                    }
                    className="rounded border border-[#557B67]/60 px-3 py-1.5 text-xs text-[#D6EAE0]"
                  >
                    {lang === 'tr' ? 'Yasağı Kaldır' : 'Lift Ban'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
