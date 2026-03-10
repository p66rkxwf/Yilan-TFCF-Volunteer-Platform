"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AdminProvider } from "./admin-context";
import { setFlashToast, useToast } from "@/components/ui/toast";

const NAV_ITEMS = [
  { icon: "dashboard", label: "儀表板", href: "/admin" },
  { icon: "calendar_today", label: "活動管理", href: "/admin/activities" },
  { icon: "group", label: "使用者管理", href: "/admin/users" },
];

const ROLE_LABELS: Record<string, string> = {
  system_admin: "系統管理員",
  unit_admin: "單位管理員",
  internal_staff: "內部人員",
};

interface AdminProfile {
  full_name: string;
  email: string;
  role: string;
  position: string | null;
}

export function AdminLayoutClient({
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

  return (
    <div className="flex h-screen overflow-hidden bg-background-light">
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white">
            <span className="material-symbols-outlined">shield_person</span>
          </div>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider leading-tight">
              後台管理
            </h1>
            <p className="text-xs text-slate-500">Admin Dashboard</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {item.icon}
                </span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}

          <div className="pt-4 mt-4 border-t border-slate-100">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">
                home
              </span>
              <span className="text-sm">回到前台</span>
            </Link>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-500 text-[16px]">
                person
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">
                {profile.full_name}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {ROLE_LABELS[profile.role] || profile.role}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-slate-400 hover:text-red-500 transition-colors"
              title="登出"
            >
              <span className="material-symbols-outlined text-[18px]">
                logout
              </span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminProvider profile={profile}>{children}</AdminProvider>
      </main>
    </div>
  );
}
