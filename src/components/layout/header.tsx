"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setFlashToast, useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { NotificationBell } from "@/components/layout/notification-bell";

export function Header() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAdmin, volunteerBlocked, isLoading } = useAuth();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error(`登出失敗：${error.message}`);
      return;
    }

    setFlashToast({
      variant: "success",
      title: "已登出",
      description: "您已安全登出。",
    });
    setMobileMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const authLink = isLoading ? null : user ? (
    <div className="flex items-center gap-10">
      {!volunteerBlocked && <NotificationBell />}
      {isAdmin && (
        <Link
          href="/admin"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          後台管理
        </Link>
      )}
      {!volunteerBlocked && (
        <Link
          href="/profile"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          個人資料
        </Link>
      )}
      <button
        onClick={handleSignOut}
        className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
      >
        登出
      </button>
    </div>
  ) : (
    <Link
      href="/login"
      className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
    >
      登入
    </Link>
  );

  const mobileAuthLink = isLoading ? null : user ? (
    <>
      {isAdmin && (
        <Link
          href="/admin"
          className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
          onClick={() => setMobileMenuOpen(false)}
        >
          後台管理
        </Link>
      )}
      {!volunteerBlocked && (
        <Link
          href="/profile"
          className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
          onClick={() => setMobileMenuOpen(false)}
        >
          個人資料
        </Link>
      )}
      {!volunteerBlocked && (
        <Link
          href="/profile/notifications"
          className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
          onClick={() => setMobileMenuOpen(false)}
        >
          通知
        </Link>
      )}
      <button
        onClick={handleSignOut}
        className="text-left text-slate-700 hover:text-primary text-base font-medium py-2 transition-colors"
      >
        登出
      </button>
    </>
  ) : (
    <Link
      href="/login"
      className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
      onClick={() => setMobileMenuOpen(false)}
    >
      登入
    </Link>
  );

  return (
    <header className="border-b border-slate-200 px-4 sm:px-6 py-4 bg-white sticky top-0 z-50">
      <div className="flex w-full items-center justify-between">
      <Link href="/" className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.webp"
          alt="宜蘭家扶中心"
          width={49}
          height={40}
          className="h-10 w-auto"
        />
        <h2 className="text-slate-900 text-xl font-bold tracking-tight">
          宜蘭家扶中心
        </h2>
      </Link>

      <nav className="hidden md:flex items-center gap-10">
        <Link
          href="/"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          首頁
        </Link>
        <Link
          href="/announcements"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          最新消息
        </Link>
        <Link
          href="/scholarship"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          獎學金專區
        </Link>
        {!volunteerBlocked && (
          <Link
            href="/volunteer"
            className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
          >
            志工專區
          </Link>
        )}
        {authLink}
      </nav>

      <div className="md:hidden">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="選單"
        >
          <span className="material-symbols-outlined text-slate-900 text-3xl">
            {mobileMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>
      </div>

      {mobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-white border-b border-slate-200 shadow-lg md:hidden z-40">
          <nav className="flex flex-col p-6 gap-4">
            <Link
              href="/"
              className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              首頁
            </Link>
            <Link
              href="/announcements"
              className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              最新消息
            </Link>
            <Link
              href="/scholarship"
              className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              獎學金專區
            </Link>
            {!volunteerBlocked && (
              <Link
                href="/volunteer"
                className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                志工專區
              </Link>
            )}
            {mobileAuthLink}
          </nav>
        </div>
      )}
    </header>
  );
}
