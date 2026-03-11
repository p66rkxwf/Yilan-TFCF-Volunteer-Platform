"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  BarChart3,
  Users,
  Settings,
  ChevronDown,
  Menu,
  X,
  LogOut,
} from "lucide-react";

interface SidebarProps {
  userRole?: "volunteer" | "admin";
}

export function Sidebar({ userRole = "volunteer" }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const volunteerMenus = [
    { icon: LayoutDashboard, label: "儀表板", href: "/volunteer/dashboard" },
    { icon: Calendar, label: "活動報名", href: "/volunteer/activities" },
    { icon: ClipboardList, label: "我的報名", href: "/volunteer/my-registrations" },
    { icon: Users, label: "個人檔案", href: "/volunteer/profile" },
  ];

  const adminMenus = [
    { icon: LayoutDashboard, label: "儀表板", href: "/manage/dashboard" },
    { icon: Calendar, label: "活動管理", href: "/manage/activities" },
    { icon: ClipboardList, label: "報名管理", href: "/manage/registrations" },
    { icon: BarChart3, label: "統計報表", href: "/manage/reports" },
    { icon: Users, label: "志工管理", href: "/manage/users" },
    { icon: Settings, label: "系統設定", href: "/manage/settings" },
  ];

  const menus = userRole === "admin" ? adminMenus : volunteerMenus;

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-20 left-4 z-40 p-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow"
        aria-label="切換側邊欄"
        aria-expanded={isOpen}
        aria-controls="dashboard-sidebar"
        type="button"
      >
        {isOpen ? <X className="w-6 h-6 text-gray-900" /> : <Menu className="w-6 h-6 text-gray-900" />}
      </button>

      {/* Sidebar */}
      <aside
        id="dashboard-sidebar"
        className={`${
          isOpen ? "w-64" : "w-0"
        } bg-gray-900 text-white transition-all duration-300 overflow-hidden md:w-64 md:relative fixed h-full z-30 md:z-0 flex flex-col`}
      >
        <div className="p-6 border-b border-gray-700">
          <Link href="/" className="flex items-center gap-3 font-bold text-lg md:text-xl hover:opacity-80 transition-opacity">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-blue-500 to-blue-600 p-1 text-center text-[11px] font-bold leading-tight text-white md:h-11 md:w-11">
              家扶中心
            </div>
            <span className="hidden md:inline text-base font-semibold">志工平台</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {menus.map((menu) => {
            const Icon = menu.icon;
            return (
              <Link
                key={menu.href}
                href={menu.href}
                className="flex items-center gap-4 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-200 group"
                onClick={() => {
                  // 在手機上點擊後關閉側邊欄
                  if (window.innerWidth < 768) {
                    setIsOpen(false);
                  }
                }}
              >
                <Icon className="w-5 h-5 md:w-6 md:h-6 group-hover:translate-x-0.5 transition-transform" />
                <span className="text-sm md:text-base font-medium">{menu.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-700">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-red-600 hover:text-white transition-all duration-200 text-sm md:text-base font-medium group">
            <LogOut className="w-5 h-5 md:w-6 md:h-6" />
            <span>登出</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 md:hidden z-20 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
