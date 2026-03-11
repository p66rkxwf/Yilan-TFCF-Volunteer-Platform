"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getBirthdayValidationError,
  normalizeBirthdayForSubmit,
  normalizeBirthdayInput,
} from "@/lib/birthday";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { Profile, YilanRegion } from "@/lib/types/database";
import { useToast } from "@/components/ui/toast";

const REGIONS: YilanRegion[] = [
  "宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉",
  "壯圍鄉", "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉",
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待審核", color: "bg-amber-100 text-amber-700" },
  approved: { label: "已通過", color: "bg-green-100 text-green-700" },
  rejected: { label: "未通過", color: "bg-red-100 text-red-700" },
  cancelled: { label: "已取消", color: "bg-slate-200 text-slate-600" },
};

interface RegistrationWithActivity {
  id: string;
  activity_id: string;
  status: string;
  created_at: string;
  activities: { title: string } | null;
}

export default function ProfilePage() {
  const supabase = createClient();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationWithActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    birthday: "",
    region: "" as YilanRegion | "",
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setForm({
          full_name: profileData.full_name || "",
          email: profileData.email || "",
          birthday: profileData.birthday || "",
          region: profileData.region || "",
        });
      }

      const { data: regData } = await supabase
        .from("registrations")
        .select("id, activity_id, status, created_at, activities(title)")
        .eq("volunteer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (regData) {
        setRegistrations(regData as unknown as RegistrationWithActivity[]);
      }

      setIsLoading(false);
    }
    load();
  }, [supabase]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const nextValue =
      name === "birthday" ? normalizeBirthdayInput(value) : value;

    setForm((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handleRegionChange = (value: string) => {
    setForm((prev) => ({ ...prev, region: value as YilanRegion | "" }));
  };

  const handleSave = async () => {
    const birthdayError = getBirthdayValidationError(form.birthday);
    if (birthdayError) {
      toast.error(birthdayError);
      return;
    }

    const normalizedBirthday = normalizeBirthdayForSubmit(form.birthday);

    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("尚未登入。");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        email: form.email,
        birthday: normalizedBirthday || null,
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
              email: form.email,
              birthday: normalizedBirthday || null,
              region: (form.region as YilanRegion) || null,
            }
          : prev
      );
      setForm((prev) => ({ ...prev, birthday: normalizedBirthday }));
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
          <section className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-slate-100 bg-slate-200 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-slate-400">person</span>
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-black">{profile?.full_name || "使用者"}</h2>
              <p className="text-slate-500">帳號：{profile?.account}</p>
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
                    <label className="text-sm font-semibold text-slate-700">生日</label>
                    <input
                      className="date-input w-full min-w-0 px-4 py-2 rounded-lg border border-slate-200 bg-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="text"
                      inputMode="numeric"
                      autoComplete="bday"
                      maxLength={10}
                      placeholder="YYYY-MM-DD"
                      pattern="\d{4}-\d{2}-\d{2}"
                      name="birthday"
                      value={form.birthday}
                      onChange={handleChange}
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
                    <label className="text-sm font-semibold text-slate-700">電子郵件</label>
                    <input
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="email"
                      name="email"
                      placeholder="example@email.com"
                      value={form.email}
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
                            <h4 className="font-bold text-sm">{reg.activities?.title || "未知活動"}</h4>
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
