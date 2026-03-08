"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

function LogoIcon() {
  return (
    <svg
      className="text-primary w-8 h-8"
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M12.0799 24L4 19.2479L9.95537 8.75216L18.04 13.4961L18.0446 4H29.9554L29.96 13.4961L38.0446 8.75216L44 19.2479L35.92 24L44 28.7521L38.0446 39.2479L29.96 34.5039L29.9554 44H18.0446L18.04 34.5039L9.95537 39.2479L4 28.7521L12.0799 24Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

const ADMIN_ROLES = ["system_admin", "unit_admin", "internal_staff"];

export function Header() {
  const router = useRouter();
  const supabase = createClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      setUser(u);
      if (u) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", u.id)
          .single();
        setIsAdmin(!!profile && ADMIN_ROLES.includes(profile.role));
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setIsAdmin(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMobileMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const authLink = isLoading ? null : user ? (
    <div className="flex items-center gap-10">
      {isAdmin && (
        <Link
          href="/admin"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
          後台管理
        </Link>
      )}
      <Link
        href="/profile"
        className="text-slate-600 text-sm font-medium hover:text-primary transition-colors flex items-center gap-1"
      >
        <span className="material-symbols-outlined text-[18px]">person</span>
        個人資料
      </Link>
      <button
        onClick={handleSignOut}
        className="text-slate-600 text-sm font-medium hover:text-red-500 transition-colors"
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
          className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2 flex items-center gap-2"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          後台管理
        </Link>
      )}
      <Link
        href="/profile"
        className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
        onClick={() => setMobileMenuOpen(false)}
      >
        個人資料
      </Link>
      <button
        onClick={handleSignOut}
        className="text-left text-red-500 text-base font-medium py-2"
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
    <header className="flex items-center justify-between border-b border-slate-200 px-6 md:px-16 py-4 bg-white sticky top-0 z-50">
      <Link href="/" className="flex items-center gap-3">
        <LogoIcon />
        <h2 className="text-slate-900 text-xl font-bold tracking-tight">
          宜蘭家扶志工平台
        </h2>
      </Link>

      <nav className="hidden md:flex items-center gap-10">
        <Link
          href="#"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          獎學金專區
        </Link>
        <Link
          href="/volunteer"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          志工專區
        </Link>
        <Link
          href="/resource"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          常見問題
        </Link>
        <Link
          href="#"
          className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
        >
          關於我們
        </Link>
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

      {mobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-white border-b border-slate-200 shadow-lg md:hidden z-40">
          <nav className="flex flex-col p-6 gap-4">
            <Link
              href="/scholarship"
              className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              獎學金專區
            </Link>
            <Link
              href="#"
              className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              志工專區
            </Link>
            <Link
              href="/resource"
              className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              常見問題
            </Link>
            <Link
              href="#"
              className="text-slate-700 text-base font-medium hover:text-primary transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              關於我們
            </Link>
            {mobileAuthLink}
          </nav>
        </div>
      )}
    </header>
  );
}
