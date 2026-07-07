"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/actions/auth";
import { useToast } from "@/components/ui/toast";
import { TurnstileWidget } from "@/components/support/turnstile-widget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function ForgotPasswordInner() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Turnstile token 為單次使用；每次寄出後 bump key 讓 widget 重新出題以供重新發送。
  const [turnstileKey, setTurnstileKey] = useState(0);

  useEffect(() => {
    if (searchParams.get("error") === "callback_failed") {
      toast.error("重設密碼連結已失效或已被使用，請重新申請一次。");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("請輸入電子郵件");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("請輸入有效的 Email 格式");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error("請先完成人機驗證後再送出。", "驗證未完成");
      return;
    }
    setError("");
    setIsLoading(true);

    const result = await resetPassword(email, turnstileToken);

    if (result.error) {
      toast.error(result.error);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
    setIsSent(true);
    toast.success("重設密碼連結已寄出，請至信箱查看。");
  };

  const handleResend = async () => {
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error("請先完成人機驗證後再重新發送。", "驗證未完成");
      return;
    }
    setIsLoading(true);

    const result = await resetPassword(email, turnstileToken);

    setIsLoading(false);
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
    if (result.error) {
      toast.error(result.error);
    } else {
      setIsSent(true);
      toast.success("已重新發送重設密碼連結。");
    }
  };

  return (
    <main className="flex flex-1 justify-center py-12 px-6">
      <div className="flex flex-col max-w-[480px] flex-1 gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-slate-900 text-4xl font-black leading-tight tracking-tight">
            忘記密碼？
          </h1>
          <p className="text-slate-600 text-base font-normal leading-relaxed">
            請輸入您註冊時的電子郵件，我們會寄送重設密碼的連結給您。
          </p>
        </div>

        {!isSent && (
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label
                className="text-slate-900 text-sm font-semibold leading-normal"
                htmlFor="email"
              >
                電子郵件
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <span className="material-symbols-outlined text-xl">
                    mail
                  </span>
                </div>
                <input
                  className={`w-full rounded-lg border ${
                    error ? "border-red-400" : "border-slate-200"
                  } bg-white text-slate-900 focus:ring-2 focus:ring-primary focus:border-primary h-14 pl-11 pr-4 placeholder:text-slate-400 text-base font-normal transition-all outline-none`}
                  id="email"
                  name="email"
                  placeholder="example@email.com"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                />
              </div>
              {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
            </div>
            {TURNSTILE_SITE_KEY && (
              <TurnstileWidget
                key={turnstileKey}
                siteKey={TURNSTILE_SITE_KEY}
                onToken={setTurnstileToken}
              />
            )}
            <button
              className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary text-white text-base font-bold leading-normal tracking-wide hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-60"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">
                  progress_activity
                </span>
              ) : (
                <span>發送重設連結</span>
              )}
            </button>
            <div className="flex items-center justify-center">
              <Link
                href="/login"
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-lg">
                  arrow_back
                </span>
                返回登入
              </Link>
            </div>
          </form>
        )}

        {isSent && (
          <div className="flex flex-col">
            <div className="flex flex-col items-center gap-6 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">
                  mark_email_read
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <p className="text-slate-900 text-xl font-bold leading-tight text-center">
                  請查看您的信箱
                </p>
                <p className="text-slate-600 text-sm font-normal leading-relaxed text-center max-w-[320px]">
                  若此電子郵件已註冊帳號，您將收到一封密碼重設連結信件。
                </p>
              </div>
              <div className="flex flex-col items-center gap-4 w-full">
                {TURNSTILE_SITE_KEY && (
                  <TurnstileWidget
                    key={turnstileKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    onToken={setTurnstileToken}
                  />
                )}
                <button
                  className="flex w-full max-w-[240px] cursor-pointer items-center justify-center rounded-lg h-10 px-4 bg-slate-200 text-slate-900 text-sm font-bold leading-normal transition-colors hover:bg-slate-300 disabled:opacity-60"
                  onClick={handleResend}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">
                      progress_activity
                    </span>
                  ) : (
                    "重新發送"
                  )}
                </button>
                <p className="text-slate-500 text-xs text-center">
                  沒有收到信件？請檢查垃圾郵件資料夾。
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center mt-6">
              <Link
                href="/login"
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-lg">
                  arrow_back
                </span>
                返回登入
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
