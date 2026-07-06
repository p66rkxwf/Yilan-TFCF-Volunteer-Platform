"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-white py-8 px-4 sm:px-6 border-t border-slate-200">
      <div className="w-full flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-3">
          <Link
            href="/resource"
            className="text-slate-500 text-xs hover:underline"
          >
            常見問題
          </Link>
          <Link
            href="/privacy"
            className="text-slate-500 text-xs hover:underline"
          >
            隱私政策
          </Link>
          <Link
            href="/terms"
            className="text-slate-500 text-xs hover:underline"
          >
            服務條款
          </Link>
          <Link
            href="/support"
            className="text-slate-500 text-xs hover:underline"
          >
            聯絡支援
          </Link>
        </div>
      </div>
    </footer>
  );
}
