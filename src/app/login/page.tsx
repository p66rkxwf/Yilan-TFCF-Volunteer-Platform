"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resolveLoginEmail } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { setFlashToast, useToast } from "@/components/ui/toast";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

// Only allow same-origin relative paths as the post-login redirect target.
// Resolves the value with the URL parser (the same normalization the router
// applies), so absolute URLs, protocol-relative "//host", and backslash/tab
// tricks like "/\\evil.com" that escape to another origin are rejected.
function safeInternalPath(raw: string | null): string {
  if (!raw) return "/";
  try {
    const base = "http://internal.invalid";
    const url = new URL(raw, base);
    if (url.origin === base) return url.pathname + url.search + url.hash;
  } catch {
    // fall through
  }
  return "/";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeInternalPath(searchParams.get("redirect"));
  const registered = searchParams.get("registered");
  const toast = useToast();
  const supabase = createClient();

  const [formData, setFormData] = useState({
    account: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (registered === "true") {
      toast.success("註冊成功，請登入您的帳號。");
    }
  }, [registered, toast]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.account.trim()) newErrors.account = "請輸入帳號或 Email";
    if (!formData.password) newErrors.password = "請輸入密碼";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    const { email, error: resolveError } = await resolveLoginEmail(
      formData.account
    );

    if (resolveError || !email) {
      toast.error(resolveError ?? "帳號不存在，請確認後再試。");
      setIsLoading(false);
      return;
    }

    // 刻意用瀏覽器端的 client 呼叫，讓 Header 等元件的
    // onAuthStateChange 立即收到登入事件，不用整頁重新整理。
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: formData.password,
    });

    if (error) {
      toast.error("帳號或密碼錯誤，請重新輸入。");
      setIsLoading(false);
      return;
    }

    setFlashToast({
      variant: "success",
      title: "登入成功",
      description: "歡迎回來。",
    });
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[440px] flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-slate-900 text-4xl font-black tracking-tight leading-tight">
            歡迎回來
          </h1>
          <p className="text-slate-600 text-lg">登入您的帳號</p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label
              className="text-slate-700 text-sm font-semibold"
              htmlFor="account"
            >
              帳號 / Email
            </label>
            <input
              className={`w-full h-12 px-4 rounded-lg border ${
                errors.account ? "border-red-400" : "border-slate-200"
              } bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400`}
              id="account"
              name="account"
              placeholder="請輸入帳號或 Email"
              type="text"
              value={formData.account}
              onChange={handleChange}
            />
            {errors.account && (
              <p className="text-red-500 text-xs mt-1">{errors.account}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label
                className="text-slate-700 text-sm font-semibold"
                htmlFor="password"
              >
                密碼
              </label>
              <Link
                href="/forgot-password"
                className="text-primary text-xs font-semibold hover:underline"
              >
                忘記密碼？
              </Link>
            </div>
            <div className="relative flex items-center">
              <input
                className={`w-full h-12 px-4 pr-12 rounded-lg border ${
                  errors.password ? "border-red-400" : "border-slate-200"
                } bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400`}
                id="password"
                name="password"
                placeholder="請輸入您的密碼"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange}
              />
              <button
                className="absolute right-4 text-slate-400 hover:text-slate-600"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password}</p>
            )}
          </div>

          <button
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">
                progress_activity
              </span>
            ) : (
              <>
                登入
                <span className="material-symbols-outlined text-[20px]">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </form>

        <p className="text-center text-slate-600 text-sm">
          還沒有帳號嗎？{" "}
          <Link href="/register" className="text-primary font-bold hover:underline">
            立即註冊
          </Link>
        </p>
      </div>
    </main>
  );
}
