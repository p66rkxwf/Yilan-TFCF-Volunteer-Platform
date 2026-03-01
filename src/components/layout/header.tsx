"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  // 模擬登入狀態，開發時可手動切換以測試 UI
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between relative z-10">
        
        {/* Logo 與 標題 (逐字保留已確認內容) */}
        <Link href="/" className="flex items-center space-x-3 focus:outline-none p-1 group">
          <Image 
            src="/logo.webp" 
            alt="Logo" 
            width={52} 
            height={52} 
            className="h-10 w-10 sm:h-12 sm:w-12 rounded-full"
            priority
          />
          <h1 className="font-bold text-base sm:text-lg whitespace-nowrap text-black transition-colors">
            宜蘭家扶志工平台
          </h1>
        </Link>

        {/* 桌面端導覽列 (效仿案例：加大間距與底線動畫) */}
        <nav className="hidden lg:flex items-center lg:space-x-8" role="navigation">
          <Link href="/" className="underline-extend px-2 py-1 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
            首頁
          </Link>
          <Link href="/resource" className="underline-extend px-2 py-1 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
            FAQ
          </Link>

          {!isLoggedIn ? (
            <>
              <Link href="/login" className="underline-extend px-2 py-1 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                登入
              </Link>
              <Link href="/register" className="underline-extend px-2 py-1 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                註冊
              </Link>
            </>
          ) : (
            <div className="relative ml-4">
              <button 
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-blue-600 focus:outline-none"
              >
                <span>Hi, 方梓寧</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full pt-2 w-48 z-50">
                  <div className="bg-white rounded-lg shadow-xl p-2 border border-gray-100">
                    <Link href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors">
                      個資管理
                    </Link>
                    <hr className="my-1 border-gray-100" />
                    <button 
                      onClick={() => setIsLoggedIn(false)}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      登出
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* 行動端三條線按鈕 (動畫結構與案例相同) */}
        <div className="lg:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="relative w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 transition-all duration-300"
            aria-label="選單"
          >
            <div className="relative w-6 h-6">
              <span className={`absolute left-0 w-6 h-0.5 bg-gray-600 transition-all duration-300 ${isOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-1'}`}></span>
              <span className={`absolute left-0 w-6 h-0.5 bg-gray-600 top-1/2 -translate-y-1/2 transition-all duration-300 ${isOpen ? 'opacity-0' : 'opacity-100'}`}></span>
              <span className={`absolute left-0 w-6 h-0.5 bg-gray-600 transition-all duration-300 ${isOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-1'}`}></span>
            </div>
          </button>
        </div>
      </div>

      {/* 行動端下拉選單 (效仿案例動畫與毛玻璃效果) */}
      <div className={`lg:hidden absolute left-0 w-full bg-white/95 backdrop-blur-lg shadow-lg border-t border-gray-100 transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[570px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="p-4 space-y-2">
          <Link href="/" className="block w-full px-4 py-3 rounded-lg text-lg text-blue-600 bg-blue-50 font-semibold" onClick={() => setIsOpen(false)}>
            首頁
          </Link>
          <Link href="/resource" className="block w-full px-4 py-3 rounded-lg text-lg text-gray-700" onClick={() => setIsOpen(false)}>
            FAQ
          </Link>
          
          {!isLoggedIn ? (
            <div className="pt-2 space-y-2">
              <Link href="/login" className="block w-full px-4 py-3 rounded-lg text-lg text-gray-700" onClick={() => setIsOpen(false)}>
                登入
              </Link>
              <Link href="/register" className="block w-full px-4 py-3 rounded-lg text-lg text-gray-700" onClick={() => setIsOpen(false)}>
                註冊
              </Link>
            </div>
          ) : (
            <div className="border-t pt-4 mt-4 border-gray-200">
              <div className="px-4 py-2 text-gray-500">Hi, 方梓寧</div>
              <Link href="/profile" className="block w-full px-4 py-3 rounded-lg text-lg text-gray-700" onClick={() => setIsOpen(false)}>
                個資管理
              </Link>
              <button 
                onClick={() => { setIsLoggedIn(false); setIsOpen(false); }}
                className="block w-full text-left px-4 py-3 rounded-lg text-lg text-red-600"
              >
                登出
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}