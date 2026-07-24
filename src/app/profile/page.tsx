"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { VolunteerProfile, YilanRegion } from "@/lib/types/database";
import { useToast } from "@/components/ui/toast";
import { getMyHoursSummary, type HoursSummary } from "@/lib/actions/registrations";
import { useAuth } from "@/components/auth-provider";
import { ProfilePageHeader } from "./profile-page-header";
import { Section, InfoRow } from "@/components/site/section";
import { isValidTaiwanPhone } from "@/lib/validation";

const REGIONS: YilanRegion[] = [
  "宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉",
  "壯圍鄉", "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉",
];

const ACCOUNT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending_review: { label: "帳號審核中，通過後即可報名", color: "bg-amber-100 text-amber-700" },
  suspended: { label: "帳號已停權", color: "bg-amber-100 text-amber-700" },
  rejected: { label: "帳號審核未通過", color: "bg-amber-100 text-amber-700" },
  graduated: { label: "帳號已結案", color: "bg-slate-200 text-slate-600" },
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";
const readonlyClass =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 outline-none";

export default function ProfilePage() {
  const supabase = createClient();
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [hoursSummary, setHoursSummary] = useState<HoursSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    region: "" as YilanRegion | "",
  });
  const [errors, setErrors] = useState<{ phone?: string }>({});

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }

    async function load(userId: string) {
      const [{ data: profileData }, summary] = await Promise.all([
        supabase.from("volunteer_profiles").select("*").eq("id", userId).maybeSingle(),
        getMyHoursSummary(),
      ]);

      if (profileData) {
        setProfile(profileData);
        setForm({
          full_name: profileData.full_name || "",
          phone: profileData.phone || "",
          region: (profileData.region as YilanRegion) || "",
        });
      }

      setHoursSummary(summary);
      setIsLoading(false);
    }
    load(user.id);
  }, [supabase, user, authLoading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegionChange = (value: string) => {
    setForm((prev) => ({ ...prev, region: value as YilanRegion | "" }));
  };

  const resetForm = () => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name || "",
      phone: profile.phone || "",
      region: (profile.region as YilanRegion) || "",
    });
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("尚未登入。");
      return;
    }
    const nextErrors: { phone?: string } = {};
    if (!form.phone.trim()) nextErrors.phone = "請輸入聯絡電話";
    else if (!isValidTaiwanPhone(form.phone)) {
      nextErrors.phone = "電話格式不正確（例：0912345678）";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);

    // V2 的欄位白名單 trigger 僅允許志工自行修改 phone/region；姓名已鎖定改由
    // 後台維護，email 改走「帳號設定」頁，生日由管理員維護。
    const { error } = await supabase
      .from("volunteer_profiles")
      .update({
        phone: form.phone,
        region: (form.region as YilanRegion) || null,
      })
      .eq("id", user.id);

    if (error) {
      toast.error(`更新失敗：${error.message}`);
    } else {
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone: form.phone,
              region: (form.region as YilanRegion) || null,
            }
          : prev
      );
      toast.success("個人資料已更新！");
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span aria-hidden="true" className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  const accountStatus = profile?.status ? ACCOUNT_STATUS_MAP[profile.status] : null;
  const isDirty =
    !!profile &&
    (form.phone !== (profile.phone || "") ||
      form.region !== ((profile.region as YilanRegion) || ""));

  return (
    <>
      <ProfilePageHeader
        title="個人資料"
        actions={
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            返回首頁
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="w-full space-y-8">
          {accountStatus ? (
            <div className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${accountStatus.color}`}>
              {accountStatus.label}
            </div>
          ) : null}

          {/* 基本資料（左標籤列）。canEdit＝有志工 profile 的帳號；
              職員帳號查無 volunteer_profiles（本頁更新不會命中任何列），
              欄位改唯讀並顯示說明，避免「可打字卻存不了」的假可編輯狀態。 */}
          <Section
            title="基本資料"
            description={profile?.username ? `帳號：${profile.username}` : undefined}
          >
            {!profile && (
              <div className="mb-3 rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
                此帳號非志工帳號，個人資料由後台職員管理維護，此頁僅供瀏覽。
              </div>
            )}
            <dl>
              <InfoRow label="姓名">
                <div className="flex items-center gap-2">
                  <input
                    className={readonlyClass}
                    type="text"
                    value={profile?.full_name || ""}
                    disabled
                    readOnly
                  />
                  <span className="whitespace-nowrap text-xs text-slate-400">如需修改請聯絡管理員</span>
                </div>
              </InfoRow>
              <InfoRow label="電話">
                <input
                  className={profile ? inputClass : readonlyClass}
                  type="tel"
                  name="phone"
                  placeholder="請輸入聯絡電話"
                  value={form.phone}
                  onChange={handleChange}
                  disabled={!profile}
                  readOnly={!profile}
                />
                {errors.phone && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">{errors.phone}</p>
                )}
              </InfoRow>
              <InfoRow label="所在地區">
                <Select
                  className="w-full"
                  triggerClassName="w-full rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  menuClassName="bg-white"
                  name="region"
                  value={form.region}
                  placeholder="請選擇"
                  ariaLabel="所在地區"
                  onValueChange={handleRegionChange}
                  options={REGIONS.map((region) => ({ value: region, label: region }))}
                  disabled={!profile}
                />
              </InfoRow>
              <InfoRow label="生日">
                <div className="flex items-center gap-2">
                  <input
                    className={`${readonlyClass} max-w-xs`}
                    type="text"
                    value={profile?.birth_date || ""}
                    disabled
                    readOnly
                  />
                  <span className="text-xs text-slate-400">如需修改請聯絡管理員</span>
                </div>
              </InfoRow>
              <InfoRow label="電子郵件">
                <div className="flex items-center gap-2">
                  <input
                    className={readonlyClass}
                    type="email"
                    value={profile?.email || ""}
                    disabled
                    readOnly
                  />
                  <span className="whitespace-nowrap text-xs text-slate-400">請至帳號設定修改</span>
                </div>
              </InfoRow>
            </dl>

            {/* 儲存/取消按鈕常駐顯示（僅志工帳號有可編輯欄位）；未修改時
                停用而非隱藏，避免使用者以為「沒有儲存按鈕」。 */}
            {profile && (
              <div className="mt-4 flex items-center justify-end gap-2 pt-1">
                {isDirty && (
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={isSaving}
                    className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    取消
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving || !isDirty}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving && (
                    <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[16px]">
                      progress_activity
                    </span>
                  )}
                  {isDirty ? "儲存變更" : "已儲存"}
                </button>
              </div>
            )}
          </Section>

          {/* 服務時數（左標籤列） */}
          <Section title="服務時數">
            <dl>
              <InfoRow label="累計時數">
                <span className="text-base font-bold text-slate-900">
                  {hoursSummary?.totalHours ?? 0}
                </span>
                <span className="ml-1 text-sm text-slate-500">
                  小時 · 出席 {hoursSummary?.attendedCount ?? 0} 場
                </span>
              </InfoRow>
              {hoursSummary && hoursSummary.totalHours > 0 ? (
                <InfoRow label="服務證明">
                  <Link
                    href="/profile/certificate"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">workspace_premium</span>
                    查看服務時數紀錄
                  </Link>
                </InfoRow>
              ) : null}
            </dl>
          </Section>
        </div>
      </div>
    </>
  );
}
