"use client";

// 一般用途的對話框（放表單等較長內容）。外框、遮罩與 Escape 行為比照
// ConfirmDialog；差別在內容由呼叫端決定、可捲動，且較寬。
// 需要「確定／取消」語意的破壞性操作請改用 ConfirmDialog。

import { useEffect, useId } from "react";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  maxWidthClass = "max-w-2xl",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    // 開啟期間鎖住背景捲動，避免長表單捲到底時背景跟著動
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        className="fixed inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-label="關閉對話框"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative my-auto w-full ${maxWidthClass} rounded-2xl border border-slate-200 bg-white shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-slate-900">
              {title}
            </h3>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[20px]">
              close
            </span>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
