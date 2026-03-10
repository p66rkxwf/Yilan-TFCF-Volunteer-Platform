"use client";

import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white py-8 px-6 md:px-16 border-t border-slate-200">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-3">
          <Link
            href="/resource"
            className="text-slate-500 text-xs hover:underline"
          >
            常見問題
          </Link>
          <Link
            href="#"
            className="text-slate-500 text-xs hover:underline"
          >
            關於我們
          </Link>
          <Link
            href="#"
            className="text-slate-500 text-xs hover:underline"
          >
            隱私政策
          </Link>
          <Link
            href="#"
            className="text-slate-500 text-xs hover:underline"
          >
            服務條款
          </Link>
          <Link
            href="#"
            className="text-slate-500 text-xs hover:underline"
          >
            聯絡支援
          </Link>
        </div>
        <p className="text-slate-400 text-xs">
          © {currentYear} 宜蘭家扶基金會. 版權所有。
        </p>
      </div>
    </footer>
  );
}
