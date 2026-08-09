"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { updatePassword, updateEmail, updateOwnVolunteerUsername } from "@/lib/actions/auth";
import {
  requestDeactivation,
  withdrawDeactivationRequest,
} from "@/lib/actions/deactivation";
import { useToast } from "@/components/ui/toast";
import { callAction } from "@/lib/ui/toast-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { NOTIFICATION_META, emailTogglableTypes } from "@/lib/notifications";
import { isValidUsername } from "@/lib/validation";
import type { DeactivationRequest, NotificationType } from "@/lib/types/database";
import { ProfilePageHeader } from "../profile-page-header";
import { InfoRow, inlineInputClass } from "@/components/site/section";
import { Spinner } from "@/components/ui/spinner";

// 志工可自行關閉的信件（提醒類）；審核結果、活動取消等重要通知不可關閉。
const VOLUNTEER_EMAIL_TYPES = emailTogglableTypes("user", "volunteer");

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
        <span translate="no" aria-hidden="true"
          className={`material-symbols-outlined notranslate text-[20px] ${
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

  const [usernameForm, setUsernameForm] = useState({ username: "" });
  const [usernameLoading, setUsernameLoading] = useState(false);
  // 目前登入帳號（僅志工帳號有 volunteer_profiles；職員為 null）
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  // 信件通知偏好（本人那一列；null＝尚未載入）
  const [emailPrefs, setEmailPrefs] = useState<NotificationType[] | null>(null);
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);

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
      .select("email, email_verified_at, username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setContactEmail((data?.email as string) ?? null);
        setEmailVerified(data ? !!data.email_verified_at : null);
        setCurrentUsername((data?.username as string) ?? null);
      });

    supabase
      .from("notification_email_prefs")
      .select("disabled_types")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setEmailPrefs((data?.disabled_types ?? []) as NotificationType[]);
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
    const result = await callAction(() => updatePassword(pwForm.password));
    setPwLoading(false);
    if (result.error) return void toast.error(result.error);

    toast.success("密碼已更新！");
    setPwForm({ password: "", confirm: "" });
  };

  const handleUsernameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    const username = usernameForm.username.trim();
    if (!username) {
      toast.error("請輸入新帳號。");
      return;
    }
    if (!isValidUsername(username)) {
      toast.error("帳號格式不正確（4～30 碼英數與 . _ -）。");
      return;
    }
    setUsernameLoading(true);
    const result = await callAction(() => updateOwnVolunteerUsername(username));
    setUsernameLoading(false);
    if (result.error) return void toast.error(result.error);

    toast.success(`帳號已更新，下次登入請改用「${username}」（密碼不變）。`);
    setCurrentUsername(username);
    setUsernameForm({ username: "" });
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailForm.email.trim()) {
      toast.error("請輸入 Email。");
      return;
    }
    setEmailLoading(true);
    const result = await callAction(() => updateEmail(emailForm.email));
    setEmailLoading(false);
    if (result.error) return void toast.error(result.error);

    toast.success("聯絡 Email 已更新，報名前請點下方「前往驗證」重新完成驗證。");
    // 變更聯絡信箱會清除驗證狀態（RPC/trigger 端強制），畫面同步反映
    setContactEmail(emailForm.email.trim());
    setEmailVerified(false);
    setEmailForm({ email: "" });
  };

  // 勾選＝寄信；DB 存的是「關閉清單」，故此處先轉成負向再寫入。
  const handleEmailPrefToggle = async (type: NotificationType, enabled: boolean) => {
    if (!user || !emailPrefs) return;
    const next = enabled
      ? emailPrefs.filter((t) => t !== type)
      : emailPrefs.includes(type)
        ? emailPrefs
        : [...emailPrefs, type];
    const previous = emailPrefs;
    setEmailPrefs(next); // 樂觀更新；失敗時還原
    setEmailPrefsLoading(true);
    try {
      // 本人可能還沒有列，故用 upsert（RLS 限 user_id = auth.uid()）
      const { error } = await supabase
        .from("notification_email_prefs")
        .upsert({ user_id: user.id, disabled_types: next });
      if (error) throw error;
      toast.success(enabled ? "已開啟此類信件通知。" : "已關閉此類信件通知。");
    } catch {
      setEmailPrefs(previous);
      toast.error("連線發生問題，設定未儲存，請再試一次。");
    } finally {
      setEmailPrefsLoading(false);
    }
  };

  const handleSubmitDeactivation = async () => {
    setDeactivateLoading(true);
    const result = await callAction(() =>
      requestDeactivation(deactivateReason.trim() || undefined)
    );
    setDeactivateLoading(false);
    if (result.error) return void toast.error(result.error);

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
  };

  const handleWithdrawDeactivation = async () => {
    setWithdrawLoading(true);
    const result = await callAction(() => withdrawDeactivationRequest());
    setWithdrawLoading(false);
    if (result.error) return void toast.error(result.error);

    toast.success("已撤回停用申請。");
    setPendingRequest(null);
  };

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
                    className={inlineInputClass}
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
                    className={inlineInputClass}
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
                    <Spinner className="text-[16px]" />
                  )}
                  更新密碼
                </button>
              </div>
            </form>
          </SettingsSection>

          {/* Username */}
          <SettingsSection
            icon="badge"
            title="修改帳號"
            description="變更登入用的帳號名稱；密碼與現有登入狀態不受影響，下次登入改用新帳號。"
          >
            {currentUsername !== null && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">目前帳號</p>
                <p className="truncate text-sm font-semibold text-slate-900">{currentUsername}</p>
              </div>
            )}

            <form onSubmit={handleUsernameUpdate}>
              <dl>
                <InfoRow label="新帳號">
                  <input
                    className={inlineInputClass}
                    placeholder="4～30 碼英數與 . _ -"
                    autoComplete="username"
                    value={usernameForm.username}
                    onChange={(e) => setUsernameForm({ username: e.target.value })}
                  />
                </InfoRow>
              </dl>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={usernameLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {usernameLoading && (
                    <Spinner className="text-[16px]" />
                  )}
                  更新帳號
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
                      <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[16px]">verified</span>
                      已完成驗證
                    </p>
                  ) : (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[16px]">error</span>
                      尚未驗證，報名活動與自行簽到前需先驗證
                    </p>
                  )}
                </div>
                {!emailVerified && (
                  <Link
                    href="/profile/verify-email"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                  >
                    <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[18px]">mark_email_read</span>
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
                    className={inlineInputClass}
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
                    <Spinner className="text-[16px]" />
                  )}
                  更新 Email
                </button>
              </div>
            </form>
          </SettingsSection>

          {/* Email notification preferences */}
          <SettingsSection
            icon="mark_email_read"
            title="信件通知偏好"
            description="關閉後仍會在站內「通知中心」收到，只是不再寄信。審核結果、活動／場次取消等重要通知一律寄送，無法關閉。"
          >
            {emailPrefs === null ? (
              <p className="text-sm text-slate-400">載入中…</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {VOLUNTEER_EMAIL_TYPES.map((type) => {
                  const enabled = !emailPrefs.includes(type);
                  return (
                    <label
                      key={type}
                      htmlFor={`email-pref-${type}`}
                      className="flex cursor-pointer items-start justify-between gap-3 py-3"
                    >
                      <span className="block min-w-0 text-sm font-semibold text-slate-800">
                        {NOTIFICATION_META[type].title}
                        <span
                          id={`email-pref-${type}-hint`}
                          className="mt-0.5 block text-xs font-normal text-slate-500"
                        >
                          {NOTIFICATION_META[type].lead}
                        </span>
                      </span>
                      <input
                        id={`email-pref-${type}`}
                        type="checkbox"
                        checked={enabled}
                        disabled={emailPrefsLoading}
                        aria-describedby={`email-pref-${type}-hint`}
                        onChange={(e) => handleEmailPrefToggle(type, e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </SettingsSection>

          {/* Deactivation request */}
          <SettingsSection
            icon="warning"
            title="停用帳號"

            danger
          >
            {isLoadingRequest ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="text-2xl text-primary" />
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
                      <Spinner className="text-[16px]" />
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
                      className={`${inlineInputClass} min-h-20`}
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
