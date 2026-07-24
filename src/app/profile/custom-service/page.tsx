"use client";

// 自訂服務登錄（志工）：登錄已完成的私下服務，送審後由職員核可計入時數。
// 權限與時數換算在 rpc_submit_custom_service 內強制；此頁只負責表單與清單。

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { ProfilePageHeader } from "../profile-page-header";
import { submitCustomService } from "@/lib/actions/custom-service";
import { taipeiLocalToIso, formatSessionRange } from "@/lib/admin/datetime";
import type { CustomServiceRecord, CustomServiceStatus } from "@/lib/types/database";

const STATUS_META: Record<CustomServiceStatus, { label: string; badge: string }> = {
  pending: { label: "待審核", badge: "bg-amber-100 text-amber-800" },
  approved: { label: "已核可", badge: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "已退回", badge: "bg-slate-200 text-slate-600" },
};

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";

function hoursBetween(startLocal: string, endLocal: string): number | null {
  if (!startLocal || !endLocal) return null;
  const ms = new Date(endLocal).getTime() - new Date(startLocal).getTime();
  if (!(ms > 0)) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export default function CustomServicePage() {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [records, setRecords] = useState<CustomServiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    startLocal: "",
    endLocal: "",
    leaderName: "",
    description: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("custom_service_records")
      .select("*")
      .eq("volunteer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(`載入登錄紀錄失敗：${error.message}`);
    else setRecords((data ?? []) as CustomServiceRecord[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const previewHours = useMemo(
    () => hoursBetween(form.startLocal, form.endLocal),
    [form.startLocal, form.endLocal]
  );

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return void toast.error("請先登入。");
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = "請填寫活動名稱";
    if (!form.startLocal) nextErrors.startLocal = "請選擇開始時間";
    if (!form.endLocal) nextErrors.endLocal = "請選擇結束時間";
    else if (form.startLocal && form.endLocal <= form.startLocal)
      nextErrors.endLocal = "結束時間需晚於開始時間";
    if (!form.leaderName.trim()) nextErrors.leaderName = "請填寫活動負責人";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    const result = await submitCustomService({
      volunteerId: user.id,
      title: form.title,
      leaderName: form.leaderName,
      description: form.description,
      startIso: taipeiLocalToIso(form.startLocal),
      endIso: taipeiLocalToIso(form.endLocal),
    });
    setIsSaving(false);
    if (result.error) return void toast.error(result.error);
    toast.success("已送出，待職員審核後計入服務時數。");
    setForm({ title: "", startLocal: "", endLocal: "", leaderName: "", description: "" });
    setErrors({});
    await load();
  };

  return (
    <>
      <ProfilePageHeader title="自訂服務登錄" />

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="w-full max-w-2xl space-y-8">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
          >
            <h2 className="text-base font-bold text-slate-900">登錄一筆私下服務</h2>
            <p className="mt-1 text-sm text-slate-500">
              適用於私下安排、未在平台公開的服務。送出後由職員審核，通過即計入您的服務時數。
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="cs-title" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  活動名稱 <span className="text-slate-400">*</span>
                </label>
                <input
                  id="cs-title"
                  className={inputCls}
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="例：社區獨居長者關懷訪視"
                  maxLength={120}
                />
                {errors.title && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">{errors.title}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cs-start" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    開始時間 <span className="text-slate-400">*</span>
                  </label>
                  <input
                    id="cs-start"
                    type="datetime-local"
                    className={inputCls}
                    value={form.startLocal}
                    onChange={(e) => set("startLocal", e.target.value)}
                  />
                  {errors.startLocal && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">{errors.startLocal}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="cs-end" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    結束時間 <span className="text-slate-400">*</span>
                  </label>
                  <input
                    id="cs-end"
                    type="datetime-local"
                    className={inputCls}
                    value={form.endLocal}
                    onChange={(e) => set("endLocal", e.target.value)}
                  />
                  {errors.endLocal && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">{errors.endLocal}</p>
                  )}
                </div>
              </div>

              {previewHours != null && (
                <p className="text-sm text-slate-500">
                  預計服務時數：<span className="font-bold text-slate-900">{previewHours}</span> 小時
                  （由起訖時間換算，實際以審核為準）
                </p>
              )}

              <div>
                <label htmlFor="cs-leader" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  活動負責人 <span className="text-slate-400">*</span>
                </label>
                <input
                  id="cs-leader"
                  className={inputCls}
                  value={form.leaderName}
                  onChange={(e) => set("leaderName", e.target.value)}
                  placeholder="這次服務的帶隊／負責人姓名"
                  maxLength={60}
                />
                {errors.leaderName && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">{errors.leaderName}</p>
                )}
              </div>

              <div>
                <label htmlFor="cs-desc" className="mb-1.5 block text-sm font-semibold text-slate-700">說明</label>
                <textarea
                  id="cs-desc"
                  className={`${inputCls} min-h-24`}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="服務內容、地點、對象等（供審核參考）"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isSaving && (
                  <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                )}
                送出審核
              </button>
            </div>
          </form>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">我的登錄紀錄</h2>
            {isLoading ? (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
                載入中…
              </p>
            ) : records.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
                尚無登錄紀錄。
              </p>
            ) : (
              <ul className="space-y-3">
                {records.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <li
                      key={r.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{r.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatSessionRange(r.start_at, r.end_at)}｜{r.service_hours} 小時
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {r.leader_name && (
                        <p className="mt-2 text-xs text-slate-500">負責人：{r.leader_name}</p>
                      )}
                      {r.status === "rejected" && r.review_note && (
                        <p className="mt-2 text-xs text-amber-700">退回說明：{r.review_note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
