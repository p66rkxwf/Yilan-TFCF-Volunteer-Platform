"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Footer } from "./footer";
import { ToastProvider } from "@/components/ui/toast";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith("/admin");

  return (
    <ToastProvider>
      {isAdminPage ? (
        <>{children}</>
      ) : (
        <div className="bg-background-light font-display text-slate-900 min-h-screen flex flex-col">
          <Header />
          {children}
          <Footer />
        </div>
      )}
    </ToastProvider>
  );
}
