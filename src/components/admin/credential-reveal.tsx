"use client";

// 一次性揭露系統代設的臨時密碼（後台建立帳號、管理員重設密碼後顯示）。
//
// 刻意不用 toast：toast 會自動消失，管理員來不及抄寫；也刻意不支援點遮罩或 Esc
// 關閉，必須明確按下確認鈕，避免誤觸後再也拿不到密碼（伺服器端不保存明文）。

import { useEffect, useRef, useState } from "react";

async function copyText(text: string): Promise<boolean> {
  // 正式站為 HTTPS，走 Clipboard API；非安全脈絡（例如以 IP 連本機 dev）
  // 該 API 不存在，退回舊的 execCommand 路徑。
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 使用者拒絕權限等情況：往下走降級路徑
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export interface CredentialRevealProps {
  open: boolean;
  /** 標題，如「密碼已重設」「職員帳號已建立」 */
  title: string;
  /** 當事人姓名，用於確認對象沒選錯 */
  personName: string;
  username: string;
  password: string;
  onClose: () => void;
}

export function CredentialReveal({
  open,
  title,
  personName,
  username,
  password,
  onClose,
}: CredentialRevealProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [wasOpen, setWasOpen] = useState(open);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 開闔切換時清掉上一次的複製提示。以 render 階段調整狀態取代 effect，
  // 避免多一輪 render（React 建議的 derived-state 寫法）。
  if (open !== wasOpen) {
    setWasOpen(open);
    setCopyState("idle");
  }

  // 開啟時把焦點移入確認鈕，維持鍵盤與讀屏使用者的焦點管理。
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    setCopyState((await copyText(password)) ? "copied" : "failed");
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credential-reveal-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="px-6 py-5">
          <h3 id="credential-reveal-title" className="text-lg font-bold text-slate-900">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            對象為 <span className="font-semibold text-slate-800">{personName}</span>
            （帳號 <span className="font-mono text-slate-800">{username}</span>）。
            請將下列臨時密碼轉告本人：
          </p>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <code className="flex-1 select-all break-all font-mono text-lg font-bold tracking-wide text-slate-900">
              {password}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <span
                translate="no"
                aria-hidden="true"
                className="material-symbols-outlined notranslate text-[16px]"
              >
                content_copy
              </span>
              複製
            </button>
          </div>
          <p
            aria-live="polite"
            className={`mt-1.5 h-4 text-xs ${
              copyState === "failed" ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {copyState === "copied" && "已複製到剪貼簿"}
            {copyState === "failed" && "複製失敗，請手動選取上方文字。"}
          </p>

          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            此密碼僅顯示這一次，關閉後系統無法再查看（若遺失請重新執行重設）。
            對方首次以此密碼登入時，會被強制要求設定新密碼。
          </p>
        </div>
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
