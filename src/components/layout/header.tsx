"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-200">
      <div className="container-custom">
        <nav className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="group flex min-w-0 items-center gap-3 shrink-0">
            {/* 使用 Next.js Image 元件載入 public/logo.webp */}
            <Image 
              src="/logo.webp" 
              alt="TFCF Logo" 
              width={36} 
              height={36} 
              className="w-8 h-8 md:w-9 md:h-9 object-contain transition-transform group-hover:scale-105 rounded-lg"
              priority
            />
            {/* 文字保持先前的縮小設定 */}
            <span className="max-w-[10rem] truncate text-xs font-bold tracking-tight text-gray-900 sm:max-w-none sm:text-sm md:text-base">
              宜蘭家扶志工平台
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6 shrink-0">
            <Link
              href="#features"
              className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
            >
              功能介紹
            </Link>
            <Link
              href="#about"
              className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
            >
              關於我們
            </Link>
            <Link
              href="/auth/login"
              className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
            >
              登入
            </Link>
            <div className="ml-3 pl-3 border-l border-gray-200">
              <Link
                href="/auth/register"
                className="btn-primary-sm shadow-sm"
              >
                註冊
              </Link>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Toggle menu"
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
            type="button"
          >
            {isOpen ? (
              <X className="w-6 h-6 text-gray-900" />
            ) : (
              <Menu className="w-6 h-6 text-gray-900" />
            )}
          </button>
        </nav>

        {/* Mobile Navigation */}
        {isOpen && (
          <div
            id="mobile-navigation"
            className="md:hidden border-t border-gray-100 pb-4 pt-3 space-y-1"
          >
            <Link
              href="#features"
              className="block text-base text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors px-4 py-2.5 rounded-md"
              onClick={() => setIsOpen(false)}
            >
              功能介紹
            </Link>
            <Link
              href="#about"
              className="block text-base text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors px-4 py-2.5 rounded-md"
              onClick={() => setIsOpen(false)}
            >
              關於我們
            </Link>
            <Link
              href="/auth/login"
              className="block text-base text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors px-4 py-2.5 rounded-md"
              onClick={() => setIsOpen(false)}
            >
              登入
            </Link>
            <div className="px-4 pt-2">
              <Link
                href="/auth/register"
                className="btn-primary w-full text-center justify-center"
                onClick={() => setIsOpen(false)}
              >
                註冊
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
