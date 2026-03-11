"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SIDEBAR_ITEMS = [
  { icon: "person", label: "個人資料", href: "/profile" },
  { icon: "description", label: "我的報名", href: "/profile/registrations" },
  { icon: "bookmark", label: "收藏項目", href: "/profile/favorites" },
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

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="hidden lg:flex w-64 border-r border-slate-200 bg-white flex-col shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg text-white">
            <span className="material-symbols-outlined block">dashboard</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">管理中心</h2>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive =
              item.href === "/profile"
                ? pathname === "/profile"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 p-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200">
              <span className="material-symbols-outlined text-slate-500">
                person
              </span>
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate">
                {profile.full_name || "使用者"}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {profile.email}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-2 py-1.5 flex justify-around">
        {SIDEBAR_ITEMS.map((item) => {
          const isActive =
            item.href === "/profile"
              ? pathname === "/profile"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-slate-400"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <main className="flex-1 flex flex-col overflow-hidden pb-16 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
