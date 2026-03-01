"use client";

import { ReactNode } from "react";
import { Header } from "./header";
import { Footer } from "./footer";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <Header />
      <main className="flex-1 min-w-0">{children}</main>
      <Footer />
    </div>
  );
}
