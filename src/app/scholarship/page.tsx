import Link from "next/link";

export default function ScholarshipPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <span className="material-symbols-outlined text-[28px]">lock</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">獎學金專區暫未開放</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          獎學金申請功能仍在準備中，開放時間將另行公告。
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            立即返回首頁
          </Link>
        </div>
      </div>
    </main>
  );
}
