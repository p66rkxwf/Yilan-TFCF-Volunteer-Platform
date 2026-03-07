"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ChevronDown, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // 模擬登入狀態，開發時可手動切換以測試 UI
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 shadow-sm backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between relative z-10">
        {/* Logo 與 標題 */}
        <Link href="/" className="flex items-center space-x-3 p-1 group focus:outline-none focus:ring-0 active:outline-none">
          <Image
            src="/logo.webp"
            alt="Logo"
            width={52}
            height={52}
            className="h-10 w-10 sm:h-12 sm:w-12 rounded-full"
            priority
          />
          <h1 className="font-bold text-base sm:text-lg whitespace-nowrap text-foreground transition-colors">
            宜蘭家扶志工平台
          </h1>
        </Link>

        {/* 桌面端導覽列 */}
        <nav className="hidden lg:flex items-center lg:space-x-6" role="navigation">
          <Link href="/" className="underline-extend nav-link px-2 py-1 text-sm font-medium text-muted hover:text-foreground transition-colors focus:outline-none focus:ring-0 active:outline-none">
            首頁
          </Link>
          <Link href="/resource" className="underline-extend nav-link px-2 py-1 text-sm font-medium text-muted hover:text-foreground transition-colors focus:outline-none focus:ring-0 active:outline-none">
            FAQ
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-border text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-0 active:outline-none"
            aria-label={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {!isLoggedIn ? (
            <>
              <Link href="/login" className="underline-extend nav-link px-2 py-1 text-sm font-medium text-muted hover:text-foreground transition-colors focus:outline-none focus:ring-0 active:outline-none">
                登入
              </Link>
              <Link href="/register" className="underline-extend nav-link px-2 py-1 text-sm font-medium text-muted hover:text-foreground transition-colors focus:outline-none focus:ring-0 active:outline-none">
                註冊
              </Link>
            </>
          ) : (
            <div className="relative ml-4">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 text-sm font-medium text-foreground focus:outline-none focus:ring-0 active:outline-none"
              >
                <span>Hi, 方梓寧</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${userMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full pt-2 w-48 z-50">
                  <div className="bg-surface rounded-lg shadow-xl p-2 border border-border">
                    <Link href="/profile" className="block px-4 py-2 text-sm text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors focus:outline-none focus:ring-0 active:outline-none">
                      個資管理
                    </Link>
                    <hr className="my-1 border-border" />
                    <button
                      onClick={() => setIsLoggedIn(false)}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors focus:outline-none focus:ring-0 active:outline-none"
                    >
                      登出
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* 行動端：主題切換 + 三條線按鈕 */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-border text-foreground focus:outline-none focus:ring-0 active:outline-none"
            aria-label={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="relative w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-300 focus:outline-none focus:ring-0 active:outline-none"
            aria-label="選單"
          >
            <div className="relative w-6 h-6">
              <span className={`absolute left-0 w-6 h-0.5 bg-foreground transition-all duration-300 ${isOpen ? "top-1/2 -translate-y-1/2 rotate-45" : "top-1"}`} />
              <span className={`absolute left-0 w-6 h-0.5 bg-foreground top-1/2 -translate-y-1/2 transition-all duration-300 ${isOpen ? "opacity-0" : "opacity-100"}`} />
              <span className={`absolute left-0 w-6 h-0.5 bg-foreground transition-all duration-300 ${isOpen ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-1"}`} />
            </div>
          </button>
        </div>
      </div>

      {/* 行動端下拉選單 */}
      <div className={`lg:hidden absolute left-0 w-full bg-surface/95 backdrop-blur-lg shadow-lg border-t border-border transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? "max-h-[570px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="p-4 space-y-2">
          <Link href="/" className="block w-full px-4 py-3 rounded-lg text-lg text-foreground font-semibold bg-zinc-100 dark:bg-zinc-800 focus:outline-none focus:ring-0 active:outline-none" onClick={() => setIsOpen(false)}>
            首頁
          </Link>
          <Link href="/resource" className="block w-full px-4 py-3 rounded-lg text-lg text-foreground focus:outline-none focus:ring-0 active:outline-none" onClick={() => setIsOpen(false)}>
            FAQ
          </Link>
          {!isLoggedIn ? (
            <div className="pt-2 space-y-2">
              <Link href="/login" className="block w-full px-4 py-3 rounded-lg text-lg text-foreground focus:outline-none focus:ring-0 active:outline-none" onClick={() => setIsOpen(false)}>
                登入
              </Link>
              <Link href="/register" className="block w-full px-4 py-3 rounded-lg text-lg text-foreground focus:outline-none focus:ring-0 active:outline-none" onClick={() => setIsOpen(false)}>
                註冊
              </Link>
            </div>
          ) : (
            <div className="border-t pt-4 mt-4 border-border">
              <div className="px-4 py-2 text-muted">Hi, 方梓寧</div>
              <Link href="/profile" className="block w-full px-4 py-3 rounded-lg text-lg text-foreground focus:outline-none focus:ring-0 active:outline-none" onClick={() => setIsOpen(false)}>
                個資管理
              </Link>
              <button
                onClick={() => {
                  setIsLoggedIn(false);
                  setIsOpen(false);
                }}
                className="block w-full text-left px-4 py-3 rounded-lg text-lg text-red-600 focus:outline-none focus:ring-0 active:outline-none"
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