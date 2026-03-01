"use client";

import Link from "next/link";
import { Facebook, Mail, Phone } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-linear-to-b from-gray-900 to-gray-950 text-gray-300">
      <div className="container-custom py-12 sm:py-16">
        <div className="mb-8 grid grid-cols-1 gap-8 sm:gap-10 md:grid-cols-4">
          {/* About */}
          <div>
            <h3 className="text-white font-bold text-base sm:text-lg mb-4">關於我們</h3>
            <p className="text-xs sm:text-sm leading-relaxed text-gray-400">
              。
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-bold text-base sm:text-lg mb-4">快速連結</h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                  首頁
                </Link>
              </li>
              <li>
                <Link
                  href="#features"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  功能介紹
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/login"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  登入
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/register"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  註冊
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-white font-bold text-base sm:text-lg mb-4">幫助與支援</h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a
                  href="#"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  常見問題
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  聯絡我們
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  隱私政策
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  服務條款
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-bold text-base sm:text-lg mb-4">聯絡方式</h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li className="flex items-center gap-2 text-gray-400">
                <Phone className="w-4 h-4" />
                <span>(03) 1234-5678</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <a
                  href="mailto:info@tfcf.org.tw"
                  className="break-all text-gray-400 hover:text-white"
                >
                  info@tfcf.org.tw
                </a>
              </li>
              <li className="flex gap-3 mt-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <Facebook className="w-5 h-5" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
            <p className="text-xs sm:text-sm text-gray-400">
              © {currentYear} 宜蘭家扶基金會. 版權所有。
            </p>
            <p className="text-xs sm:text-sm text-gray-400">
              Designed & Developed with ❤️
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
