"use client";

// 全站 error boundary。沒有本檔時，任何未攔截的例外都會顯示 Next.js 的英文
// 預設畫面（"Application error: a client-side exception has occurred"）。
//
// 刻意不顯示 error.message：與全站「錯誤訊息不外洩技術字串給操作者」的慣例一致，
// 詳情走 console（開發時可見）與 Cloudflare 的例外告警（見 workers/orchestrator）。

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <span
          translate="no"
          aria-hidden="true"
          className="material-symbols-outlined notranslate text-[28px]"
        >
          error
        </span>
      </div>

      <h1 className="text-xl font-bold text-slate-900">頁面發生問題</h1>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        載入這個頁面時發生非預期的錯誤。
        <br />
        請重新載入試試，若持續發生請聯絡宜蘭家扶中心承辦社工。
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          重新載入
        </button>
        <Link
          href="/"
          className="rounded-lg border-2 border-zinc-300 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-zinc-100"
        >
          回首頁
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 text-xs text-slate-400">錯誤代碼：{error.digest}</p>
      )}
    </main>
  );
}
