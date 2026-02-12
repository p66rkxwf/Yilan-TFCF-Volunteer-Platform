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
    <div className="flex h-screen bg-gray-50">
      <Sidebar userRole={userRole} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <div className="container-custom py-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
