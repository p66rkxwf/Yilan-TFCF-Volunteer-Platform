"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Footer } from "./footer";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/auth-provider";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith("/admin");

  return (
    <ToastProvider>
      {isAdminPage ? (
        // admin 頁面已在 admin/layout.tsx 伺服器端抓好 user/profile 並以
        // props 傳入，不需要（也不消費）AuthProvider，避免多餘的網路請求。
        <>{children}</>
      ) : (
        <AuthProvider>
          <div className="bg-background-light font-display text-slate-900 min-h-screen flex flex-col">
            <Header />
            {children}
            <Footer />
          </div>
        </AuthProvider>
      )}
    </ToastProvider>
  );
}
