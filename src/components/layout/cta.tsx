"use client";

import Link from "next/link";

export function CTA() {
  return (
    <section
      id="about"
      className="section-padding-lg scroll-mt-24 relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-700"
    >
      {/* 裝飾背景 */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-screen filter blur-3xl opacity-20 -mr-48 -mt-32"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-300 rounded-full mix-blend-screen filter blur-3xl opacity-20 -ml-48 -mb-32"></div>
      
      <div className="max-w-6xl mx-auto px-6 sm:px-8 text-center relative z-10">
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-md mx-auto sm:max-w-none">
        </div>
      </div>
    </section>
  );
}
