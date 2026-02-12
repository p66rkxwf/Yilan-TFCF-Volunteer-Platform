"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-200">
      <div className="container-custom">
        <nav className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg sm:text-xl md:text-2xl hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-linear-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm md:text-base">
              TFCF
            </div>
            <span className="hidden sm:inline text-gray-900 text-base md:text-lg font-semibold">
              宜蘭志工平台
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            <Link
              href="#features"
              className="text-base text-gray-700 hover:text-gray-900 transition-colors px-4 py-2 hover:bg-gray-50 rounded-md"
            >
              功能介紹
            </Link>
            <Link
              href="#about"
              className="text-base text-gray-700 hover:text-gray-900 transition-colors px-4 py-2 hover:bg-gray-50 rounded-md"
            >
              關於我們
            </Link>
            <Link
              href="/auth/login"
              className="text-base text-gray-700 hover:text-gray-900 transition-colors px-4 py-2 hover:bg-gray-50 rounded-md"
            >
              登入
            </Link>
            <div className="ml-3 pl-3 border-l border-gray-200">
              <Link
                href="/auth/register"
                className="btn-primary-sm"
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
          <div className="md:hidden pb-4 border-t border-gray-100 space-y-1">
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
                className="btn-primary w-full text-center"
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
