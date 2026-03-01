"use client";

import { Hero } from "@/components/layout/hero";
import { Features } from "@/components/layout/features";

export default function Home() {
  return (
    <main className="flex flex-col flex-1 w-full">
      <Hero />
      <Features />
    </main>
  );
}
