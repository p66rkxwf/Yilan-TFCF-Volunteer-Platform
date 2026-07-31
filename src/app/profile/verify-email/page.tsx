"use client";

// 志工 Email 驗證頁：寄送 6 碼到聯絡信箱 → 輸入驗證。驗證通過才能報名與自行簽到。
// 守衛在 rpc_request_email_otp / rpc_verify_email_otp 內強制，本頁只負責流程與提示。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { ProfilePageHeader } from "../profile-page-header";
import { requestEmailOtp, verifyEmailOtp } from "@/lib/actions/email-verify";

export default function VerifyEmailPage() {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("volunteer_profiles")
      .select("email, email_verified_at")
      .eq("id", user.id)
      .maybeSingle();
    setEmail((data?.email as string) ?? "");
    setVerified(!!data?.email_verified_at);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSend = async () => {
    setSending(true);
    const result = await requestEmailOtp();
    setSending(false);
    if (result.error) return void toast.error(result.error);
    toast.success("驗證碼已寄出，請查收聯絡信箱（15 分鐘內有效）。");
    setSentOnce(true);
    setCooldown(60);
  };

  const handleVerify = async () => {
    setVerifying(true);
    const result = await verifyEmailOtp(code);
    setVerifying(false);
    if (result.error) return void toast.error(result.error);
    toast.success("Email 已驗證，您現在可以報名活動了。");
    setVerified(true);
  };

  return (
    <>
      <ProfilePageHeader title="驗證 Email" />

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="w-full max-w-xl space-y-5">
          {verified === null ? (
            <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-400">
              載入中…
            </div>
          ) : verified ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">verified</span>
                您的 Email（{email}）已完成驗證
              </p>
              <p className="mt-2 text-sm text-emerald-700/80">
                您可以正常報名活動與自行簽到。
              </p>
              <Link
                href="/volunteer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                前往活動列表
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>
          ) : (
            <div className="rounded-md border border-slate-200 bg-white p-6">
              <p className="text-sm text-slate-600">
                為確認聯絡信箱正確，報名活動前需先完成 Email 驗證。系統會寄送 6 位數
                驗證碼到您的聯絡信箱：
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900">{email || "（尚未設定聯絡信箱）"}</p>
              <p className="mt-1 text-xs text-slate-400">
                信箱有誤？請至「帳號設定」更新聯絡 Email 後再驗證。
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || cooldown > 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">mail</span>
                  {cooldown > 0 ? `重新寄送（${cooldown}）` : sentOnce ? "重新寄送驗證碼" : "寄送驗證碼"}
                </button>
              </div>

              {sentOnce && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="otp">
                    輸入驗證碼
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input
                      id="otp"
                      inputMode="numeric"
                      maxLength={6}
                      className="w-40 rounded-lg border border-slate-200 px-4 py-2 text-lg tracking-[0.4em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="000000"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={verifying || code.length !== 6}
                      className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      {verifying ? "驗證中…" : "驗證"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
