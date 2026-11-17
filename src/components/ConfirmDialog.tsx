import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  minReasonLength?: number;
  initialReason?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  requireReason = false,
  reasonLabel,
  reasonPlaceholder,
  minReasonLength = 3,
  initialReason = '',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useApp();
  const [reason, setReason] = useState(initialReason);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setError('');
    }
  }, [open, initialReason]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (requireReason && trimmed.length < minReasonLength) {
      setError(
        `${reasonLabel || t.common.reasonLabel} (${minReasonLength}+)`
      );
      return;
    }
    void onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-[#2A3831] bg-[#101715] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                danger
                  ? 'border-[#9E3B33]/60 bg-[#3B1816]/60 text-[#F3D1CE]'
                  : 'border-[#B89B63]/50 bg-[#1B241E] text-[#B89B63]'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3
                id="confirm-dialog-title"
                className="font-display text-xl font-semibold text-[#E9E7DF]"
              >
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#A9AEA7]">{message}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label={t.common.close}
            className="text-[#8D968F] hover:text-[#E9E7DF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {requireReason && (
          <div className="mt-5">
            <label
              htmlFor="confirm-dialog-reason"
              className="block text-xs font-medium text-[#C8CEC7]"
            >
              {reasonLabel || t.common.reasonLabel}
            </label>
            <input
              id="confirm-dialog-reason"
              type="text"
              autoFocus
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              placeholder={reasonPlaceholder || t.common.reasonPlaceholder}
              className="mt-1.5 w-full rounded-md border border-[#26352E] bg-[#090D0C] px-3 py-2 text-sm text-[#E9E7DF] focus:border-[#B89B63] focus:outline-none"
            />
            {error && <p className="mt-1.5 text-xs text-[#F3D1CE]">{error}</p>}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-md border border-[#26352E] bg-[#090D0C] px-4 py-2 text-xs font-medium text-[#C8CEC7] hover:text-[#E9E7DF] disabled:opacity-50"
          >
            {cancelLabel || t.common.cancel}
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`rounded-md px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
              danger
                ? 'bg-[#9E3B33] text-[#F9EAEA] hover:bg-[#B2473E]'
                : 'bg-[#B89B63] text-[#090D0C] hover:bg-[#C9AD75]'
            }`}
          >
            {confirmLabel || t.common.confirm}
          </button>
        </div>
      </form>
    </div>
  );
}
