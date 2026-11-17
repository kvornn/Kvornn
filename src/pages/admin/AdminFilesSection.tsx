import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest, uploadWithProgress } from '../../lib/api';
import { resolveLocalizedText } from '../../shared/i18n';
import { ArchiveDTO, FileDownloadPermission } from '../../shared/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface AdminFileRow {
  id: string;
  archive_id: string;
  title: string;
  description: string;
  downloadPermission: FileDownloadPermission;
  title_tr: string;
  title_en: string;
  original_name: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  sha256: string;
  scan_status: string;
  download_count: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export function AdminFilesSection() {
  const { lang, t } = useApp();
  const [files, setFiles] = useState<AdminFileRow[]>([]);
  const [archives, setArchives] = useState<ArchiveDTO[]>([]);

  // Standalone Upload Form State
  const [uploadArchiveId, setUploadArchiveId] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadPerm, setUploadPerm] = useState<FileDownloadPermission>('INHERIT');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Edit File Metadata State
  const [editingFile, setEditingFile] = useState<AdminFileRow | null>(null);
  const [editArchiveId, setEditArchiveId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPerm, setEditPerm] = useState<FileDownloadPermission>('INHERIT');

  const [deleteTarget, setDeleteTarget] = useState<AdminFileRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [fileRes, arcRes] = await Promise.all([
        apiRequest<{ files: AdminFileRow[] }>('/api/admin/files'),
        apiRequest<{ archives: ArchiveDTO[] }>('/api/admin/archives').catch(() => ({
          archives: [],
        })),
      ]);
      setFiles(fileRes.files || []);
      const arcs = arcRes.archives || [];
      setArchives(arcs);
      if (arcs.length > 0 && !uploadArchiveId) {
        setUploadArchiveId(arcs[0].id);
      }
    } catch {
      // ignore
    }
  }, [uploadArchiveId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadArchiveId || !selectedFile) return;
    setErr('');
    setMsg('');
    setBusy(true);
    setUploadProgress(0);
    const form = new FormData();
    form.append('archiveId', uploadArchiveId);
    if (uploadTitle.trim()) form.append('title', uploadTitle.trim());
    if (uploadDesc.trim()) form.append('description', uploadDesc.trim());
    form.append('downloadPermission', uploadPerm);
    form.append('file', selectedFile);

    try {
      await uploadWithProgress('/api/admin/files', form, (pct) => setUploadProgress(pct));
      setMsg(
        lang === 'tr'
          ? `Dosya yüklendi ve SHA-256 doğrulandı: ${selectedFile.name}`
          : `Uploaded and verified SHA-256: ${selectedFile.name}`
      );
      setUploadTitle('');
      setUploadDesc('');
      setUploadPerm('INHERIT');
      setSelectedFile(null);
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const startEdit = (f: AdminFileRow) => {
    setEditingFile(f);
    setEditArchiveId(f.archive_id);
    setEditTitle(f.title || f.original_name);
    setEditDesc(f.description || '');
    setEditPerm(f.downloadPermission || 'INHERIT');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFile) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await apiRequest(`/api/admin/files/${editingFile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          archiveId: editArchiveId,
          title: editTitle,
          description: editDesc,
          downloadPermission: editPerm,
        }),
      });
      setMsg(lang === 'tr' ? 'Dosya bilgileri güncellendi.' : 'File metadata updated.');
      setEditingFile(null);
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setErr('');
    try {
      await apiRequest(`/api/admin/files/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg(
        lang === 'tr'
          ? `Dosya kalıcı olarak silindi: ${deleteTarget.original_name}`
          : `Permanently deleted ${deleteTarget.original_name}`
      );
      if (editingFile?.id === deleteTarget.id) setEditingFile(null);
      setDeleteTarget(null);
      await loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={lang === 'tr' ? 'Dosyayı Sil' : 'Delete File'}
        message={
          deleteTarget
            ? lang === 'tr'
              ? `"${deleteTarget.original_name}" dosyasını diskten ve arşivden kalıcı olarak silmek istediğinize emin misiniz?`
              : `Permanently delete "${deleteTarget.original_name}" from private storage?`
            : ''
        }
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

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

      {/* Standalone Upload Panel */}
      <form
        onSubmit={handleUpload}
        className="rounded-xl border border-[#223029] bg-[#101715] p-6 space-y-4"
      >
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {lang === 'tr' ? 'Yeni Dosya Yükle' : 'Upload Archival Document'}
        </h2>

        {archives.length === 0 ? (
          <p className="text-xs text-[#A9AEA7]">
            {lang === 'tr'
              ? 'Dosya yükleyebilmek için önce Archives bölümünden en az bir arşiv oluşturun.'
              : 'Create at least one archive in the Archives section before uploading files.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="file-archive-id" className="block text-xs text-[#C8CEC7]">
                  {lang === 'tr' ? 'Hedef Arşiv' : 'Target Archive'}
                </label>
                <select
                  id="file-archive-id"
                  required
                  value={uploadArchiveId}
                  onChange={(e) => setUploadArchiveId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
                >
                  {archives.map((a) => (
                    <option key={a.id} value={a.id}>
                      {resolveLocalizedText(a.titleTr, a.titleEn, lang)} ({a.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="file-title" className="block text-xs text-[#C8CEC7]">
                  {lang === 'tr' ? 'Belge Başlığı (Opsiyonel)' : 'Document Title (Optional)'}
                </label>
                <input
                  id="file-title"
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Uses filename if blank"
                  className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
                />
              </div>
              <div>
                <label htmlFor="file-dl-perm" className="block text-xs text-[#C8CEC7]">
                  {lang === 'tr' ? 'İndirme İzni Politikası' : 'Download Policy'}
                </label>
                <select
                  id="file-dl-perm"
                  value={uploadPerm}
                  onChange={(e) => setUploadPerm(e.target.value as FileDownloadPermission)}
                  className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
                >
                  <option value="INHERIT">INHERIT (RBAC Matrix)</option>
                  <option value="ALLOW">ALLOW (Force Permitted)</option>
                  <option value="DENY">DENY (Block All Downloads)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="file-desc" className="block text-xs text-[#C8CEC7]">
                  {lang === 'tr' ? 'Açıklama' : 'Description'}
                </label>
                <input
                  id="file-desc"
                  type="text"
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
                />
              </div>
              <div>
                <label htmlFor="file-binary" className="block text-xs text-[#C8CEC7]">
                  {lang === 'tr' ? 'Dosya Seç (Maks 25 MB)' : 'Choose File (Max 25 MB)'}
                </label>
                <input
                  id="file-binary"
                  type="file"
                  required
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="mt-1.5 w-full text-xs text-[#C8CEC7]"
                />
              </div>
            </div>

            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-[11px] text-[#B89B63]">
                  <span>Uploading to encrypted private vault...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-[#18221D]">
                  <div
                    className="h-full bg-[#B89B63] transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !selectedFile}
              className="inline-flex items-center gap-2 rounded-md bg-[#B89B63] px-5 py-2.5 text-xs font-semibold text-[#090D0C] disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{lang === 'tr' ? 'Güvenli Yüklemeyi Başlat' : 'Upload File Securely'}</span>
            </button>
          </>
        )}
      </form>

      {/* Edit File Metadata Inline Form */}
      {editingFile && (
        <form
          onSubmit={saveEdit}
          className="rounded-xl border border-[#B89B63]/50 bg-[#101715] p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold text-[#E9E7DF]">
              {lang === 'tr' ? 'Dosya Düzenle' : 'Edit File Metadata'} — {editingFile.original_name}
            </h3>
            <button
              type="button"
              onClick={() => setEditingFile(null)}
              className="text-xs text-[#8D968F] hover:text-[#E9E7DF]"
            >
              {t.common.cancel}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="edit-file-title" className="block text-xs text-[#C8CEC7]">
                Title
              </label>
              <input
                id="edit-file-title"
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              />
            </div>
            <div>
              <label htmlFor="edit-file-archive" className="block text-xs text-[#C8CEC7]">
                Linked Archive
              </label>
              <select
                id="edit-file-archive"
                value={editArchiveId}
                onChange={(e) => setEditArchiveId(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              >
                {archives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {resolveLocalizedText(a.titleTr, a.titleEn, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-file-perm" className="block text-xs text-[#C8CEC7]">
                Download Policy
              </label>
              <select
                id="edit-file-perm"
                value={editPerm}
                onChange={(e) => setEditPerm(e.target.value as FileDownloadPermission)}
                className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
              >
                <option value="INHERIT">INHERIT</option>
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="edit-file-desc" className="block text-xs text-[#C8CEC7]">
              Description
            </label>
            <input
              id="edit-file-desc"
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-xs text-[#E9E7DF]"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[#B89B63] px-5 py-2 text-xs font-semibold text-[#090D0C]"
          >
            {t.admin.saveChanges}
          </button>
        </form>
      )}

      {/* Existing Files Ledger */}
      <section className="rounded-xl border border-[#223029] bg-[#101715] p-6">
        <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
          {t.admin.menu.files} ({files.length})
        </h2>
        <p className="mt-1 text-xs text-[#8D968F]">
          {lang === 'tr'
            ? 'Tüm dosyalar genel erişime kapalı özel depolamada saklanır ve yalnızca yetki kontrollü imzalı bağlantılarla sunulur.'
            : 'All files are isolated in private storage and delivered strictly via permission-enforced HMAC signed URLs.'}
        </p>

        {files.length === 0 ? (
          <p className="mt-6 text-sm text-[#8D968F]">
            {lang === 'tr' ? 'Henüz yüklenmiş dosya yok.' : 'No files uploaded yet.'}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#223029] text-[#8D968F]">
                  <th className="py-3 pr-4 font-medium">File</th>
                  <th className="py-3 pr-4 font-medium">Archive</th>
                  <th className="py-3 pr-4 font-medium">Policy</th>
                  <th className="py-3 pr-4 font-medium">SHA-256</th>
                  <th className="py-3 pr-4 font-medium">Scan</th>
                  <th className="py-3 pr-4 font-medium text-right">Downloads</th>
                  <th className="py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2823]">
                {files.map((f) => (
                  <tr key={f.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-[#E9E7DF]">{f.title || f.original_name}</p>
                      <p className="font-mono text-[11px] text-[#8D968F]">
                        {f.original_name} · {f.extension.toUpperCase()} · {f.size_bytes} B
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-[#C8CEC7]">
                      {resolveLocalizedText(f.title_tr, f.title_en, lang)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[11px]">
                      <span
                        className={
                          f.downloadPermission === 'DENY'
                            ? 'text-[#E58A82]'
                            : f.downloadPermission === 'ALLOW'
                            ? 'text-[#557B67]'
                            : 'text-[#B89B63]'
                        }
                      >
                        {f.downloadPermission}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-[#8D968F]">
                      {f.sha256.slice(0, 14)}…
                    </td>
                    <td className="py-3 pr-4 font-mono text-[#557B67]">{f.scan_status}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-[#E9E7DF]">
                      {f.download_count}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(f)}
                          className="rounded border border-[#26352E] p-1.5 text-[#C8CEC7] hover:border-[#B89B63]"
                          aria-label={`Edit ${f.original_name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          className="rounded border border-[#26352E] p-1.5 text-[#E58A82] hover:border-[#9E3B33]"
                          aria-label={`Delete ${f.original_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
