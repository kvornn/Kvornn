import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { resolveLocalizedText } from '../shared/i18n';
import { Language } from '../shared/types';

export function ProfilePage() {
  const { user, lang, setLang, setUser, t } = useApp();
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [preferredLang, setPreferredLang] = useState<Language>(user?.preferredLang || lang);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      const res = await apiRequest<{ user: any }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username, avatarUrl, preferredLang }),
      });
      setUser(res.user);
      await setLang(preferredLang);
      setMessage(t.profile.savedSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-[820px] px-6 py-10">
      <div className="border-b border-[#1D2823] pb-6">
        <h1 className="font-display text-4xl font-semibold text-[#E9E7DF]">{t.profile.title}</h1>
        <p className="mt-2 text-sm text-[#A9AEA7]">{t.profile.subtitle}</p>
      </div>

      <div className="mt-8 rounded-xl border border-[#223029] bg-[#101715] p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1D2823] pb-6">
          <div>
            <p className="text-xs text-[#8D968F]">{t.profile.rankLabel}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-[#B89B63]">
              {t.ranks[user.rank]}
              {user.adminProfile ? ` · ${t.adminProfiles[user.adminProfile]}` : ''}
            </p>
            {user.customRoles && user.customRoles.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-[#8D968F]">{t.profile.customRolesLabel}</p>
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {user.customRoles.map((cr) => (
                    <span
                      key={cr.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: cr.color || '#E9E7DF' }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: cr.color || '#B89B63' }}
                      />
                      {resolveLocalizedText(cr.displayNameTr, cr.displayNameEn, lang)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-[#8D968F]">{t.profile.keyTypeLabel}</p>
            <p className="mt-1 font-mono text-sm text-[#557B67]">
              {user.keyType} · HMAC-HASHED
            </p>
          </div>
        </div>

        {message && (
          <div className="mt-6 rounded-md border border-[#557B67]/60 bg-[#15241D] px-4 py-3 text-sm text-[#D6EAE0]">
            {message}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-[#9E3B33]/60 bg-[#3B1816]/50 px-4 py-3 text-sm text-[#F3D1CE]"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="prof-username" className="block text-xs font-medium text-[#C8CEC7]">
              {t.auth.username}
            </label>
            <input
              id="prof-username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-3 text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="prof-avatar" className="block text-xs font-medium text-[#C8CEC7]">
              Avatar URL
            </label>
            <input
              id="prof-avatar"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="mt-2 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-3 text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="prof-lang" className="block text-xs font-medium text-[#C8CEC7]">
              {t.profile.languageLabel}
            </label>
            <select
              id="prof-lang"
              value={preferredLang}
              onChange={(e) => setPreferredLang(e.target.value as Language)}
              className="mt-2 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-3 text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
            >
              <option value="tr">Türkçe (TR)</option>
              <option value="en">English (EN)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#B89B63] px-6 py-3 text-sm font-semibold text-[#090D0C] hover:bg-[#C9AD75] disabled:opacity-50"
          >
            {t.profile.saveProfile}
          </button>
        </form>
      </div>
    </main>
  );
}
