"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { updatePassword, updateEmail } from "@/lib/actions/auth";
import {
  requestDeactivation,
  withdrawDeactivationRequest,
} from "@/lib/actions/deactivation";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import type { DeactivationRequest } from "@/lib/types/database";
import { ProfilePageHeader } from "../profile-page-header";
import { InfoRow } from "@/components/site/section";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

function SettingsSection({
  icon,
  title,
  description,
  children,
  danger,
}: {
  icon: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-2.5 border-b border-slate-200 pb-2.5">
        <span
          className={`material-symbols-outlined text-[20px] ${
            danger ? "text-amber-600" : "text-primary"
          }`}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const supabase = createClient();
  const toast = useToast();
  const { user } = useAuth();

  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  const [emailForm, setEmailForm] = useState({ email: "" });
  const [emailLoading, setEmailLoading] = useState(false);
  // 目前聯絡信箱與驗證狀態（僅志工帳號有 volunteer_profiles；職員為 null）
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  const [pendingRequest, setPendingRequest] = useState<DeactivationRequest | null>(null);
  const [isLoadingRequest, setIsLoadingRequest] = useState(true);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsLoadingRequest(false);
      return;
    }

    let active = true;
    supabase
      .from("deactivation_requests")
      .select("*")
      .eq("volunteer_id", user.id)
      .eq("status", "pending")
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setPendingRequest(data);
          setIsLoadingRequest(false);
        }
      });

    supabase
      .from("volunteer_profiles")
      .select("email, email_verified_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setContactEmail((data?.email as string) ?? null);
        setEmailVerified(data ? !!data.email_verified_at : null);
      });

    return () => {
      active = false;
    };
  }, [supabase, user]);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pwForm.password.trim() || !pwForm.confirm.trim()) {
      toast.error("請輸入新密碼並再次確認。");
      return;
    }
    if (pwForm.password !== pwForm.confirm) {
      toast.error("兩次密碼輸入不一致。");
      return;
    }
    if (pwForm.password.length < 8) {
      toast.error("密碼至少需要 8 個字元。");
      return;
    }

    setPwLoading(true);
    try {
      const result = await updatePassword(pwForm.password);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("密碼已更新！");
        setPwForm({ password: "", confirm: "" });
      }
    } catch {
      toast.error("連線發生問題，請檢查網路後再試一次。");
    } finally {
      setPwLoading(false);
    }
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailForm.email.trim()) {
      toast.error("請輸入 Email。");
      return;
    }
    setEmailLoading(true);
    try {
      const result = await updateEmail(emailForm.email);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("聯絡 Email 已更新，報名前請點下方「前往驗證」重新完成驗證。");
        // 變更聯絡信箱會清除驗證狀態（RPC/trigger 端強制），畫面同步反映
        setContactEmail(emailForm.email.trim());
        setEmailVerified(false);
        setEmailForm({ email: "" });
      }
    } catch {
      toast.error("連線發生問題，請檢查網路後再試一次。");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSubmitDeactivation = async () => {
    setDeactivateLoading(true);

    try {
      const result = await requestDeactivation(deactivateReason.trim() || undefined);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("停用申請已送出，待管理員審核。");
        setShowDeactivateConfirm(false);
        setDeactivateReason("");
        if (user) {
          const { data } = await supabase
            .from("deactivation_requests")
            .select("*")
            .eq("volunteer_id", user.id)
            .eq("status", "pending")
            .maybeSingle();
          setPendingRequest(data);
        }
      }
    } catch {
      toast.error("連線發生問題，請檢查網路後再試一次。");
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleWithdrawDeactivation = async () => {
    setWithdrawLoading(true);

    try {
      const result = await withdrawDeactivationRequest();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("已撤回停用申請。");
        setPendingRequest(null);
      }
    } catch {
      toast.error("連線發生問題，請檢查網路後再試一次。");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const inputCls =
    "w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

  return (
    <>
      <ProfilePageHeader title="帳號設定" />

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="w-full space-y-8">
          {/* Password */}
          <SettingsSection
            icon="lock"
            title="修改密碼"

          >
            <form onSubmit={handlePasswordUpdate}>
              <dl>
                <InfoRow label="新密碼">
                  <input
                    type="password"
                    className={inputCls}
                    placeholder="至少 8 個字元"
                    autoComplete="new-password"
                    value={pwForm.password}
                    onChange={(e) => setPwForm((p) => ({ ...p, password: e.target.value }))}
                    minLength={8}
                  />
                </InfoRow>
                <InfoRow label="確認新密碼">
                  <input
                    type="password"
                    className={inputCls}
                    placeholder="再次輸入新密碼"
                    autoComplete="new-password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                    minLength={8}
                  />
                </InfoRow>
              </dl>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {pwLoading && (
                    <span className="material-symbols-outlined animate-spin text-[16px]">
                      progress_activity
                    </span>
                  )}
                  更新密碼
                </button>
              </div>
            </form>
          </SettingsSection>

          {/* Email */}
          <SettingsSection
            icon="mail"
            title="修改聯絡 Email"

          >
            {contactEmail !== null && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{contactEmail}</p>
                  {emailVerified ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      已完成驗證
                    </p>
                  ) : (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <span className="material-symbols-outlined text-[16px]">error</span>
                      尚未驗證，報名活動與自行簽到前需先驗證
                    </p>
                  )}
                </div>
                {!emailVerified && (
                  <Link
                    href="/profile/verify-email"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                  >
                    <span className="material-symbols-outlined text-[18px]">mark_email_read</span>
                    前往驗證
                  </Link>
                )}
              </div>
            )}

            <form onSubmit={handleEmailUpdate}>
              <dl>
                <InfoRow label="新 Email">
                  <input
                    type="email"
                    className={inputCls}
                    placeholder="new-email@example.com"
                    value={emailForm.email}
                    onChange={(e) => setEmailForm({ email: e.target.value })}
                  />
                </InfoRow>
              </dl>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {emailLoading && (
                    <span className="material-symbols-outlined animate-spin text-[16px]">
                      progress_activity
                    </span>
                  )}
                  更新 Email
                </button>
              </div>
            </form>
          </SettingsSection>

          {/* Deactivation request */}
          <SettingsSection
            icon="warning"
            title="停用帳號"

            danger
          >
            {isLoadingRequest ? (
              <div className="flex items-center justify-center py-6">
                <span className="material-symbols-outlined animate-spin text-2xl text-primary">
                  progress_activity
                </span>
              </div>
            ) : pendingRequest ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 font-medium">
                    停用申請已於 {DATE_FORMATTER.format(new Date(pendingRequest.created_at))} 送出，待管理員處理。
                  </p>
                  {pendingRequest.reason ? (
                    <p className="mt-2 text-sm text-amber-700">申請原因：{pendingRequest.reason}</p>
                  ) : null}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleWithdrawDeactivation}
                    disabled={withdrawLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    {withdrawLoading && (
                      <span className="material-symbols-outlined animate-spin text-[16px]">
                        progress_activity
                      </span>
                    )}
                    撤回申請
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <dl>
                  <InfoRow label="申請原因" align="start">
                    <textarea
                      className={`${inputCls} min-h-20`}
                      rows={3}
                      placeholder="請簡述申請停用的原因（選填）"
                      value={deactivateReason}
                      onChange={(e) => setDeactivateReason(e.target.value)}
                    />
                  </InfoRow>
                </dl>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setShowDeactivateConfirm(true)}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                  >
                    送出停用申請
                  </button>
                </div>
              </div>
            )}
          </SettingsSection>
        </div>
      </div>

      <ConfirmDialog
        open={showDeactivateConfirm}
        title="確定要送出停用申請嗎？"
        description="送出後，管理員審核通過時您的帳號將轉為停權，未開始的已核准報名會一併取消。"
        confirmText="送出申請"
        cancelText="取消"
        isLoading={deactivateLoading}
        onClose={() => {
          if (deactivateLoading) return;
          setShowDeactivateConfirm(false);
        }}
        onConfirm={handleSubmitDeactivation}
      />
    </>
  );
}
