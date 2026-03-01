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
      
      <div className="container-custom text-center relative z-10">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-5 sm:mb-7 leading-tight">
          準備好加入志工行列了嗎？
        </h2>
        <p className="text-base sm:text-lg text-blue-100 mb-8 sm:mb-10 md:mb-12 max-w-2xl mx-auto leading-relaxed">
          無論您是想要奉獻心力的志工，還是需要管理團隊的管理者，我們都為您準備好了。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center">
          <Link
            href="/auth/register"
            className="inline-flex w-full items-center justify-center rounded-lg bg-white px-8 py-3 text-base font-semibold text-blue-600 transition-all duration-200 hover:-translate-y-1 hover:bg-gray-50 hover:shadow-2xl sm:w-auto sm:px-10 sm:py-4 sm:text-lg"
          >
            志工註冊
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex w-full items-center justify-center rounded-lg border-2 border-white px-8 py-3 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-1 hover:bg-white hover:text-blue-600 hover:shadow-2xl sm:w-auto sm:px-10 sm:py-4 sm:text-lg"
          >
            管理員登入
          </Link>
        </div>
      </div>
    </section>
  );
}
