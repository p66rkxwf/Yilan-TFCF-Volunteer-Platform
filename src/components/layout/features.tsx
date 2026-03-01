"use client";

import {
  Users,
  Calendar,
  Clock,
  BarChart3,
  Bell,
  LogIn,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "志工管理",
    description: "完整的志工檔案管理，記錄基本資料、技能和服務時數",
  },
  {
    icon: Calendar,
    title: "活動報名",
    description: "便利的活動報名系統，實時查看可報名的志工活動",
  },
  {
    icon: Clock,
    title: "時數統計",
    description: "自動統計服務時數，清晰展示個人貢獻",
  },
  {
    icon: BarChart3,
    title: "數據報表",
    description: "完整的統計分析報表，幫助管理決策",
  },
  {
    icon: Bell,
    title: "智能通知",
    description: "通過 LINE 和 Email 及時推送活動通知",
  },
  {
    icon: LogIn,
    title: "安全認證",
    description: "完善的身份驗證機制，保護用戶隱私",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="section-padding scroll-mt-24 bg-linear-to-b from-white to-gray-50"
    >
      <div className="container-custom">
        <div className="text-center mb-16 sm:mb-20">
          <h2 className="gradient-heading mb-4 sm:mb-6">
            主要功能
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            全方位的志工管理解決方案，讓志願服務更簡單高效
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="feature-card group h-full"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-linear-to-br from-blue-100 to-indigo-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
