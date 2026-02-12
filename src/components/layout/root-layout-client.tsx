"use client";

import { ReactNode } from "react";
import { Header } from "./header";
import { Footer } from "./footer";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
