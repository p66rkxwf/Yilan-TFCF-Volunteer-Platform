"use client";

import Link from "next/link";

export function Hero() {
  return (
    <section className="section-padding-lg bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      {/* 裝飾背景 */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -mr-32 -mt-32"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -ml-32 -mb-32"></div>
      
      <div className="container-custom text-center relative z-10">
        <h1 className="gradient-heading mb-6 sm:mb-8 animate-fade-in-up">
          宜蘭TFCF志工平台
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-gray-700 mb-8 sm:mb-10 md:mb-12 max-w-3xl mx-auto leading-relaxed font-light">
          一個為宜蘭家扶基金會志工服務而創設的平台，讓志工輕鬆報名活動、管理時數，讓管理者高效統籌志工資源。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center">
          <Link href="/auth/register" className="btn-primary">
            開始志工之旅
          </Link>
          <Link href="#features" className="btn-outline">
            了解更多
          </Link>
        </div>
      </div>
    </section>
  );
}