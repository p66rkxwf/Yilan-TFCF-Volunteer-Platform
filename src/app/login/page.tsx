"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/actions/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  const [formData, setFormData] = useState({
    account: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
    if (serverError) setServerError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setServerError("");

    const result = await signIn(formData);

    if (result.error) {
      setServerError(result.error);
      setIsLoading(false);
      return;
    }

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

        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {serverError}
          </div>
        )}

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

          <div className="flex items-center gap-3 py-1">
            <input
              className="h-5 w-5 rounded border-slate-300 bg-transparent text-primary focus:ring-0 focus:ring-offset-0 transition-colors"
              id="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <label
              className="text-slate-600 text-sm select-none"
              htmlFor="remember"
            >
              記住我 30 天
            </label>
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
