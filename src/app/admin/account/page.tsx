"use client";

// 帳號設定（全體職員）：自改 電話/地區/Email/帳號；姓名與職稱由系統管理員維護
// （於職員管理「編輯」代管）。寫入走 updateOwnStaffProfile（RPC 全程稽核；
// Email 同時是登入信箱，action 內會同步 auth.users）。並提供修改密碼。
// 另含「信件通知偏好」：只影響本人收信，與 /admin/settings 的全站寄信設定分開。

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../admin-context";
import { updateOwnStaffProfile } from "@/lib/actions/staff-profile";
import { updatePassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Field, inputClass, ToggleRow } from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { STAFF_JOB_TITLE } from "@/lib/admin/labels";
import { YILAN_REGIONS } from "@/lib/types/database";
import type { NotificationType } from "@/lib/types/database";
import { NOTIFICATION_META, emailTogglableTypes } from "@/lib/notifications";
import { isValidEmail, isValidTaiwanPhone, isValidUsername } from "@/lib/validation";

// 職員可自行關閉的信件（提醒／待辦類）；審核結果等重要通知只有全站設定能關。
const MY_EMAIL_TYPES = emailTogglableTypes("user", "staff");

export default function AccountSettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const profile = useAdminProfile();

  const [form, setForm] = useState({ phone: "", region: "", email: "", username: "" });
  // 目前儲存於 DB 的帳號（供變更偵測與成功提示）
  const [savedUsername, setSavedUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSavingPw, setIsSavingPw] = useState(false);

  // 信件偏好：本人停寄的通知型別（null＝尚未載入）＋全站已關閉的型別（唯讀顯示）
  const [emailPrefs, setEmailPrefs] = useState<NotificationType[] | null>(null);
  const [globalOff, setGlobalOff] = useState<NotificationType[]>([]);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data }, prefsRes, settingsRes] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("username, email, phone, region")
        .eq("id", profile.id)
        .maybeSingle(),
      supabase
        .from("notification_email_prefs")
        .select("disabled_types")
        .eq("user_id", profile.id)
        .maybeSingle(),
      // 職員讀得到 system_settings（RLS 限 fn_is_staff）；用來標示哪些已被全站關閉
      supabase.from("system_settings").select("email_disabled_types").maybeSingle(),
    ]);
    if (data) {
      setForm({
        phone: (data.phone as string) ?? "",
        region: (data.region as string) ?? "",
        email: (data.email as string) ?? "",
        username: (data.username as string) ?? "",
      });
      setSavedUsername((data.username as string) ?? "");
    }
    setEmailPrefs((prefsRes.data?.disabled_types ?? []) as NotificationType[]);
    setGlobalOff((settingsRes.data?.email_disabled_types ?? []) as NotificationType[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!form.phone.trim()) nextErrors.phone = "請輸入聯絡電話";
    else if (!isValidTaiwanPhone(form.phone)) {
      nextErrors.phone = "電話格式不正確（例：0912345678 或 03-1234567）";
    }
    if (!form.email.trim()) nextErrors.email = "請輸入 Email";
    else if (!isValidEmail(form.email)) nextErrors.email = "Email 格式不正確";
    if (!form.username.trim()) nextErrors.username = "請輸入帳號";
    else if (!isValidUsername(form.username)) {
      nextErrors.username = "帳號需為 4～30 碼英數字或 . _ -";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    const result = await updateOwnStaffProfile({
      phone: form.phone.trim(),
      region: form.region.trim() || undefined,
      email: form.email.trim(),
      username: form.username.trim(),
    });
    setIsSaving(false);
    if (result.error) return void toast.error(`更新失敗：${result.error}`);

    const usernameChanged = form.username.trim() !== savedUsername;
    toast.success("個人資料已更新");
    if (usernameChanged) {
      toast.info(`帳號已變更，下次登入請改用「${form.username.trim()}」（密碼不變）。`);
    }
    await load();
    // 讓 admin layout 重新抓 profile，側欄與 context（email 等）保持同步。
    router.refresh();
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) return void toast.error("請輸入新密碼並再次確認。");
    if (password !== confirm) return void toast.error("兩次密碼輸入不一致。");
    if (password.length < 8) return void toast.error("密碼至少需要 8 個字元。");

    setIsSavingPw(true);
    const result = await updatePassword(password);
    setIsSavingPw(false);
    if (result.error) return void toast.error(result.error);

    toast.success("密碼已更新。");
    setPassword("");
    setConfirm("");
  };

  // 勾選＝寄信；DB 存的是「關閉清單」，故此處轉成負向後 upsert（本人可能還沒有列）。
  const handleEmailPrefToggle = async (type: NotificationType, enabled: boolean) => {
    if (!emailPrefs) return;
    const next = enabled
      ? emailPrefs.filter((t) => t !== type)
      : emailPrefs.includes(type)
        ? emailPrefs
        : [...emailPrefs, type];
    const previous = emailPrefs;
    setEmailPrefs(next); // 樂觀更新；失敗時還原
    setIsSavingPrefs(true);
    const { error } = await supabase
      .from("notification_email_prefs")
      .upsert({ user_id: profile.id, disabled_types: next });
    setIsSavingPrefs(false);
    if (error) {
      setEmailPrefs(previous);
      return void toast.error(`更新失敗：${error.message}`);
    }
    toast.success(enabled ? "已開啟此類信件通知。" : "已關閉此類信件通知。");
  };

  return (
    <>
      <PageHeader
        title="帳號設定"
        description="管理您自己的登入資訊與聯絡方式；姓名與職稱由系統管理員維護。"
      />

      <div className="flex-1 p-4 sm:p-6">
        <div className="max-w-3xl space-y-5">
          <form onSubmit={handleSubmit}>
            <Panel title="個人資料">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="姓名" hint="由系統管理員維護，如需修改請洽系統管理員。">
                  <input
                    className={`${inputClass} bg-slate-50 text-slate-500`}
                    value={profile.full_name}
                    disabled
                    readOnly
                  />
                </Field>
                <Field label="職稱" hint="由系統管理員維護。">
                  <input
                    className={`${inputClass} bg-slate-50 text-slate-500`}
                    value={STAFF_JOB_TITLE[profile.job_title] ?? profile.job_title}
                    disabled
                    readOnly
                  />
                </Field>
                <Field
                  label="帳號"
                  required
                  error={errors.username}
                  hint="您以此帳號登入，變更後下次登入即改用新帳號（密碼不變）。"
                >
                  <input
                    className={inputClass}
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                    disabled={isLoading}
                    autoComplete="username"
                  />
                </Field>
                <Field
                  label="Email"
                  required
                  error={errors.email}
                  hint="同時是您的登入信箱，變更後即刻生效。"
                >
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </Field>
                <Field label="聯絡電話" required error={errors.phone}>
                  <input
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    disabled={isLoading}
                    autoComplete="tel"
                  />
                </Field>
                <Field label="地區">
                  <Select
                    value={form.region}
                    onValueChange={(v) => set("region", v)}
                    placeholder="請選擇地區"
                    options={YILAN_REGIONS.map((r) => ({ value: r, label: r }))}
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Button type="submit" size="sm" isLoading={isSaving} disabled={isLoading}>
                  儲存個人資料
                </Button>
              </div>
            </Panel>
          </form>

          <form onSubmit={handlePasswordSubmit}>
            <Panel title="修改密碼">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="新密碼" required>
                  <input
                    type="password"
                    className={inputClass}
                    placeholder="至少 8 個字元"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="確認新密碼" required>
                  <input
                    type="password"
                    className={inputClass}
                    placeholder="再次輸入新密碼"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Button type="submit" size="sm" isLoading={isSavingPw}>
                  更新密碼
                </Button>
              </div>
            </Panel>
          </form>

          <Panel
            title="信件通知偏好"
            description="只影響您自己收到的信；關閉後仍會在站內通知中心看到。變更即時儲存。"
          >
            {emailPrefs === null ? (
              <p className="text-sm text-slate-400">載入中…</p>
            ) : (
              <div className="-mx-3">
                {MY_EMAIL_TYPES.map((type) => {
                  const offGlobally = globalOff.includes(type);
                  return (
                    <ToggleRow
                      key={type}
                      label={NOTIFICATION_META[type].title}
                      hint={NOTIFICATION_META[type].lead}
                      note={offGlobally ? "已由系統設定全站關閉" : undefined}
                      checked={!offGlobally && !emailPrefs.includes(type)}
                      disabled={offGlobally || isSavingPrefs}
                      onChange={(enabled) => handleEmailPrefToggle(type, enabled)}
                    />
                  );
                })}
              </div>
            )}
            <p className="mt-2 px-3 text-xs text-slate-400">
              審核結果、活動／場次取消等重要通知一律寄送，不列於此。
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
