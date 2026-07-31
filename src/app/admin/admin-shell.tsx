"use client";

// 後台外殼：深色分組側欄＋亮色內容區。
// 側欄依業務分四組（工作台／活動營運／學生／系統），
// 「操作紀錄」僅系統管理員可見（RLS 亦僅系統管理員可讀，雙重防護）。

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AdminProvider } from "./admin-context";
import type { AdminProfile } from "./admin-context";
import { setFlashToast, useToast } from "@/components/ui/toast";
import { STAFF_ROLE } from "@/lib/admin/labels";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  exact?: boolean;
  systemAdminOnly?: boolean;
  adminOnly?: boolean; // 單位管理員以上；否則不顯示此項（頁面本身也會擋）
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "工作台",
    items: [{ href: "/admin", icon: "space_dashboard", label: "儀表板", exact: true }],
  },
  {
    label: "活動營運",
    items: [
      { href: "/admin/activities", icon: "event", label: "活動管理" },
      { href: "/admin/registrations", icon: "fact_check", label: "報名審核" },
      { href: "/admin/custom-service", icon: "assignment_add", label: "自訂服務審核" },
      { href: "/admin/attendance", icon: "how_to_reg", label: "出席簽到" },
    ],
  },
  {
    label: "學生",
    items: [
      { href: "/admin/volunteers", icon: "groups", label: "學生名冊" },
      { href: "/admin/volunteer-review", icon: "person_check", label: "帳號審核", adminOnly: true },
      { href: "/admin/blacklist", icon: "person_off", label: "黑名單" },
      { href: "/admin/annual-review", icon: "school", label: "年度審查" },
    ],
  },
  {
    label: "系統",
    items: [
      { href: "/admin/staff", icon: "badge", label: "職員管理" },
      { href: "/admin/announcements", icon: "campaign", label: "公告管理" },
      { href: "/admin/support", icon: "support_agent", label: "支援需求" },
      { href: "/admin/reports", icon: "bar_chart", label: "報表與統計" },
      { href: "/admin/settings", icon: "tune", label: "期間與參數" },
      { href: "/admin/logs", icon: "history", label: "操作紀錄", systemAdminOnly: true },
    ],
  },
];

export function AdminShell({
  profile,
  children,
}: {
  profile: AdminProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(`登出失敗：${error.message}`);
      return;
    }
    setFlashToast({
      variant: "success",
      title: "已登出",
      description: "管理員帳號已登出。",
    });
    router.push("/login");
    router.refresh();
  };

  const isSystemAdmin = profile.role === "system_admin";
  const isAdmin = isSystemAdmin || profile.role === "unit_admin";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="關閉選單"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-slate-900 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">volunteer_activism</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">後台管理系統</p>
            <p className="text-[11px] text-slate-400">宜蘭家扶中心</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) =>
                (!item.systemAdminOnly || isSystemAdmin) &&
                (!item.adminOnly || isAdmin)
            );
            if (items.length === 0) return null;

            return (
              <div key={group.label}>
                <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    return (
                      // prefetch={false}：側欄 15 個連結若預抓，一進後台會同時打出十幾個
                      // RSC render，在 Workers 免費方案 10ms CPU 上限下整批被砍（error 1102）。
                      // 後台為內部工具，點擊時才載入即可。
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-primary font-semibold text-white"
                            : "text-slate-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[19px]">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="border-t border-white/10 pt-3">
            <Link
              href="/"
              prefetch={false}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[19px]">home</span>
              回到前台
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-1 rounded-lg py-1.5 pl-2 pr-1">
            {/* 頭像＋姓名連到「帳號設定」（全體職員可自改聯絡與登入資訊） */}
            <Link
              href="/admin/account"
              title="帳號設定"
              prefetch={false}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-white/5"
              onClick={() => setMobileNavOpen(false)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                {profile.full_name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{profile.full_name}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {STAFF_ROLE[profile.role] ?? profile.role}
                </p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              title="登出"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="開啟選單"
            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
          >
            <span aria-hidden="true" className="material-symbols-outlined">menu</span>
          </button>
          <span className="text-sm font-bold text-slate-900">後台管理系統</span>
        </div>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col overflow-y-auto outline-none"
        >
          <AdminProvider profile={profile}>{children}</AdminProvider>
        </main>
      </div>
    </div>
  );
}
