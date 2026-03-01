"use client";

import Link from "next/link";

export function Hero() {
  return (
    <section className="relative pt-12 pb-20 md:pt-24 md:pb-32 overflow-hidden bg-white">
      {/* 裝飾背景：更細膩的點綴 */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-blue-50 rounded-full blur-3xl opacity-50 -mr-20 -mt-20"></div>
      
      <div className="container-custom relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="gradient-heading animate-fade-in-up">
            宜蘭 TFCF 志工平台
          </h1>
          <p className="mt-6 text-gray-500 md:text-xl font-normal leading-relaxed">
            串聯熱血青年與社區需求，讓每一份服務都更有意義。
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/register" className="btn-primary shadow-blue-200/50 shadow-lg">
              立即加入
            </Link>
            <Link href="#features" className="btn-outline">
              了解更多
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}