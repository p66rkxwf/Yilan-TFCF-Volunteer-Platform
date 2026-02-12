"use client";

import { Hero } from "@/components/layout/hero";
import { Features } from "@/components/layout/features";
import { CTA } from "@/components/layout/cta";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <CTA />
    </main>
  );
}
