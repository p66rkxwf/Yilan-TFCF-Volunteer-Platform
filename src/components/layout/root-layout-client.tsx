"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Header } from "./header";
import { Footer } from "./footer";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
        <Header />
        <main className="flex-1 min-w-0">{children}</main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}
