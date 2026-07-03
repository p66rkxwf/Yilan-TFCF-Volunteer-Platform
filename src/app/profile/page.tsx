"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { VolunteerProfile, YilanRegion } from "@/lib/types/database";
import { useToast } from "@/components/ui/toast";
import { getMyHoursSummary, type HoursSummary } from "@/lib/actions/registrations";
import { useAuth } from "@/components/auth-provider";

const REGIONS: YilanRegion[] = [
  "宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉",
  "壯圍鄉", "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉",
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待審核", color: "bg-amber-100 text-amber-700" },
  approved: { label: "已通過", color: "bg-green-100 text-green-700" },
  rejected: { label: "未通過", color: "bg-red-100 text-red-700" },
  cancel_pending: { label: "取消審核中", color: "bg-amber-100 text-amber-700" },
  cancelled: { label: "已取消", color: "bg-slate-200 text-slate-600" },
  expired: { label: "已過期", color: "bg-slate-200 text-slate-600" },
};

const ACCOUNT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending_review: { label: "帳號審核中，通過後即可報名", color: "bg-amber-100 text-amber-700" },
  suspended: { label: "帳號已停權", color: "bg-red-100 text-red-700" },
  rejected: { label: "帳號審核未通過", color: "bg-red-100 text-red-700" },
  graduated: { label: "帳號已結案", color: "bg-slate-200 text-slate-600" },
};

interface RegistrationWithActivity {
  id: string;
  status: string;
  created_at: string;
  activity_sessions: { activities: { title: string } | null } | null;
}

export default function ProfilePage() {
  const supabase = createClient();
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationWithActivity[]>([]);
  const [hoursSummary, setHoursSummary] = useState<HoursSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    region: "" as YilanRegion | "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }

    async function load(userId: string) {
      const [{ data: profileData }, { data: regData }, summary] = await Promise.all([
        supabase.from("volunteer_profiles").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("registrations")
          .select("id, status, created_at, activity_sessions(activities(title))")
          .eq("volunteer_id", userId)
          .order("created_at", { ascending: false })
          .limit(5),
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

      if (regData) {
        setRegistrations(regData as unknown as RegistrationWithActivity[]);
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

  const handleSave = async () => {
    if (!user) {
      toast.error("尚未登入。");
      return;
    }

    setIsSaving(true);

    // V2 的欄位白名單 trigger 僅允許自行修改 full_name/phone/region；
    // email 改走「帳號設定」頁的 Email 更新流程，生日由管理員維護。
    const { error } = await supabase
      .from("volunteer_profiles")
      .update({
        full_name: form.full_name,
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
              full_name: form.full_name,
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
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  const accountStatus = profile?.status ? ACCOUNT_STATUS_MAP[profile.status] : null;

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 md:px-8 shrink-0">
        <h1 className="text-lg font-bold">個人資料管理</h1>
        <Link
          href="/"
          className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-lg font-semibold text-sm hover:bg-primary/20 transition-colors"
        >
          返回首頁
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {accountStatus ? (
            <div className={`p-4 rounded-lg text-sm font-semibold ${accountStatus.color}`}>
              {accountStatus.label}
            </div>
          ) : null}

          <section className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-slate-100 bg-slate-200 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-slate-400">person</span>
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-black">{profile?.full_name || "使用者"}</h2>
              <p className="text-slate-500">帳號：{profile?.username}</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/"
                className="px-5 py-2.5 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                取消
              </Link>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold hover:opacity-90 transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {isSaving && (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                )}
                儲存變更
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <section className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">person</span>
                  個人詳細資料
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">姓名</label>
                    <input
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="text"
                      name="full_name"
                      placeholder="例：王小明"
                      value={form.full_name}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      生日
                      <span className="text-slate-400 font-normal ml-1">（如需修改請聯絡管理員）</span>
                    </label>
                    <input
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 outline-none"
                      type="text"
                      value={profile?.birth_date || ""}
                      disabled
                      readOnly
                    />
                  </div>
                </div>
              </section>

              <section className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">mail</span>
                  聯絡資訊
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      電子郵件
                      <span className="text-slate-400 font-normal ml-1">（請至帳號設定修改）</span>
                    </label>
                    <input
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 outline-none"
                      type="email"
                      value={profile?.email || ""}
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">電話</label>
                    <input
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="tel"
                      name="phone"
                      placeholder="請輸入聯絡電話"
                      value={form.phone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">所在地區</label>
                    <Select
                      className="w-full"
                      triggerClassName="w-full rounded-lg border border-slate-200 bg-transparent px-4 py-2 text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      menuClassName="bg-white"
                      name="region"
                      value={form.region}
                      ariaLabel="所在地區"
                      onValueChange={handleRegionChange}
                      options={[
                        { value: "", label: "請選擇" },
                        ...REGIONS.map((region) => ({ value: region, label: region })),
                      ]}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">timer</span>
                  服務時數
                </h3>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-slate-900">
                    {hoursSummary?.totalHours ?? 0}
                  </span>
                  <span className="text-sm font-semibold text-slate-500 mb-1.5">小時</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  累計出席 {hoursSummary?.attendedCount ?? 0} 場活動
                </p>
                {hoursSummary && hoursSummary.totalHours > 0 ? (
                  <Link
                    href="/profile/certificate"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
                  >
                    <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
                    下載服務證明
                  </Link>
                ) : null}
              </section>

              <section className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="text-lg font-bold mb-4">近期報名</h3>
                {registrations.length === 0 ? (
                  <p className="text-slate-400 text-sm py-4 text-center">尚無報名紀錄</p>
                ) : (
                  <div className="space-y-4">
                    {registrations.map((reg) => {
                      const s = STATUS_MAP[reg.status] || STATUS_MAP.pending;
                      return (
                        <div key={reg.id} className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-sm">
                              {reg.activity_sessions?.activities?.title || "未知活動"}
                            </h4>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.color}`}>
                              {s.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            報名於 {new Date(reg.created_at).toLocaleDateString("zh-TW")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Link
                  href="/profile/registrations"
                  className="block w-full mt-6 text-sm font-bold text-primary hover:underline text-center"
                >
                  查看所有報名
                </Link>
              </section>

              <section className="bg-primary p-6 rounded-xl text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="font-bold text-lg mb-2">探索活動</h3>
                  <p className="text-sm opacity-90 mb-4">查看最新的志工服務機會。</p>
                  <Link
                    href="/volunteer"
                    className="block w-full py-2 bg-white text-primary rounded-lg font-bold text-sm text-center hover:bg-slate-50 transition-colors"
                  >
                    立即查看
                  </Link>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-20">
                  <span className="material-symbols-outlined text-[100px]">auto_awesome</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
