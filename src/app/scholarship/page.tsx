"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setFlashToast } from "@/components/ui/toast";

export default function ScholarshipPage() {
  const router = useRouter();

  useEffect(() => {
    setFlashToast({
      variant: "info",
      title: "尚未開放",
      description: "獎學金專區目前暫停開放，已為您返回首頁。",
    });

    router.replace("/");
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          獎學金專區暫未開放
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          目前不開放進入獎學金相關頁面，系統將自動帶您返回首頁。
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90"
          >
            立即返回首頁
          </Link>
        </div>
      </div>
    </main>
  );
}
