"use client";

// 個人中心：桌面左側側欄導覽 ＋ 手機底部導覽。

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { icon: "person", label: "個人資料", href: "/profile" },
  { icon: "description", label: "我的報名", href: "/profile/registrations" },
  { icon: "bookmark", label: "收藏", href: "/profile/favorites" },
  { icon: "workspace_premium", label: "服務時數紀錄", href: "/profile/certificate" },
  { icon: "settings", label: "帳號設定", href: "/profile/settings" },
];

interface ProfileInfo {
  full_name: string;
  email: string;
}

export function ProfileLayoutClient({
  profile,
  children,
}: {
  profile: ProfileInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/profile" ? pathname === "/profile" : pathname.startsWith(href);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-3 p-6">
          <div className="rounded-lg bg-primary p-2 text-white">
            <span className="material-symbols-outlined block">account_circle</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">個人中心</h2>
        </div>

        <nav className="flex-1 space-y-1 px-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3 p-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200">
              <span className="material-symbols-outlined text-slate-500">person</span>
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm font-semibold">{profile.full_name || "使用者"}</p>
              <p className="truncate text-xs text-slate-500">{profile.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 手機底部導覽 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white px-2 py-1.5 lg:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
              isActive(item.href) ? "text-primary" : "text-slate-400"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white pb-16 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
