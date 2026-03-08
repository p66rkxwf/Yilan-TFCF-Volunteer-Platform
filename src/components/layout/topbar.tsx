"use client";

import { Bell, User, LogOut } from "lucide-react";
import Link from "next/link";

export function TopBar() {
  return (
    <div className="h-16 md:h-20 bg-white border-b border-gray-200 flex items-center justify-between px-6 sm:px-8 gap-4 sm:gap-6">
      <div className="flex-1" />
      
      <div className="flex items-center gap-5 sm:gap-6">
        {/* Notifications */}
        <button className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200" title="通知">
          <Bell className="w-5 h-5 md:w-6 md:h-6" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
        </button>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <p className="text-sm font-medium text-gray-900">用戶名稱</p>
            <p className="text-xs text-gray-500">志工</p>
          </div>
          <button className="w-9 h-9 md:w-10 md:h-10 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors duration-200" title="用戶菜單">
            <User className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
          </button>
        </div>

        {/* Logout */}
        <button className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200" title="登出">
          <LogOut className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>
    </div>
  );
}
