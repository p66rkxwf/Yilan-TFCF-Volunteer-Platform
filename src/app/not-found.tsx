// 找不到頁面（404）。沒有本檔時 Next.js 會回英文預設頁
// （"This page could not be found"），與全站中文介面不一致。
// 版型比照 account-review：置中、單一訊息、兩個明確出口。

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <span
          translate="no"
          aria-hidden="true"
          className="material-symbols-outlined notranslate text-[28px]"
        >
          search_off
        </span>
      </div>

      <h1 className="text-xl font-bold text-slate-900">找不到這個頁面</h1>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        網址可能已經變更或輸入有誤。
        <br />
        您可以回首頁重新開始，或直接前往活動列表。
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Link
          href="/"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          回首頁
        </Link>
        <Link
          href="/volunteer"
          className="rounded-lg border-2 border-zinc-300 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-zinc-100"
        >
          瀏覽志工活動
        </Link>
      </div>
    </main>
  );
}
