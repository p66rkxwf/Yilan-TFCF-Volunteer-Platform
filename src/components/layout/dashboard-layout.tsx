"use client";

import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

interface DashboardLayoutProps {
  children: ReactNode;
  userRole?: "volunteer" | "admin";
}

export function DashboardLayout({
  children,
  userRole = "volunteer",
}: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50 md:h-screen">
      <Sidebar userRole={userRole} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="container-custom py-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
