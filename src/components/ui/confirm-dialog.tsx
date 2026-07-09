"use client";

import { useEffect, useId, useState } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isConfirmDanger?: boolean;
  isLoading?: boolean;
  /** 強確認：需輸入指定文字（如對象名稱）確認鈕才會啟用。用於不可復原的操作。 */
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "確定",
  cancelText = "取消",
  isConfirmDanger = false,
  isLoading = false,
  requireText,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const isBlocked = requireText != null && typed.trim() !== requireText;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-label="關閉對話框"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="px-6 py-5">
          <h3 id={titleId} className="text-lg font-bold text-slate-900">{title}</h3>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
          {requireText != null && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                此操作無法復原，請輸入「{requireText}」以確認：
              </label>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={requireText}
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || isBlocked}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              isConfirmDanger
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            {isLoading ? "處理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

