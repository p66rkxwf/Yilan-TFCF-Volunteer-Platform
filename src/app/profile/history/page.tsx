"use client";

// 個人中心「歷年活動」：列出自己「已核准且場次已結束」的參加紀錄（含缺席）。
// 與「我的報名」不同：此頁只收已辦完的活動，供回顧歷年參與；點列進報名詳情。
// 資料靠 registrations RLS（僅本人列）；場次是否結束以 end_at < now 判定。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { ProfilePageHeader } from "../profile-page-header";
import { formatSessionRange } from "@/lib/admin/datetime";

const ATTENDANCE_MAP: Record<string, { label: string; color: string }> = {
  attended: { label: "已出席", color: "bg-emerald-100 text-emerald-700" },
  makeup_attended: { label: "已出席（補登）", color: "bg-emerald-100 text-emerald-700" },
  absent: { label: "缺席", color: "bg-amber-100 text-amber-700" },
};

const NOT_RECORDED = { label: "未記錄出席", color: "bg-slate-100 text-slate-500" };

interface HistoryRow {
  id: string;
  kind: "registration" | "custom";
  attendance: string | null;
  service_hours: number | null;
  activity_title: string;
  activity_location: string;
  session_start_at: string;
  session_end_at: string;
}

export default function HistoryPage() {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data, error }, { data: custom }] = await Promise.all([
      supabase
        .from("registrations")
        .select(
          "id, attendance, service_hours, activity_sessions(start_at, end_at, activities(title, location))"
        )
        .eq("volunteer_id", user.id)
        .eq("status", "approved"),
      supabase
        .from("custom_service_records")
        .select("id, title, service_hours, start_at, end_at")
        .eq("volunteer_id", user.id)
        .eq("status", "approved"),
    ]);

    if (error) {
      toast.error(`載入失敗：${error.message}`);
      setIsLoading(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const fromRegs: HistoryRow[] = ((data ?? []) as any[]).map((r) => {
      const session = r.activity_sessions;
      return {
        id: r.id as string,
        kind: "registration" as const,
        attendance: (r.attendance ?? null) as string | null,
        service_hours: r.service_hours == null ? null : Number(r.service_hours),
        activity_title: session?.activities?.title ?? "未知活動",
        activity_location: session?.activities?.location ?? "",
        session_start_at: session?.start_at ?? null,
        session_end_at: session?.end_at ?? null,
      };
    });

    // 已核可的自訂服務（私下服務）也列入歷年紀錄
    const fromCustom: HistoryRow[] = ((custom ?? []) as any[]).map((c) => ({
      id: c.id as string,
      kind: "custom" as const,
      attendance: "attended",
      service_hours: c.service_hours == null ? null : Number(c.service_hours),
      activity_title: c.title as string,
      activity_location: "",
      session_start_at: c.start_at as string,
      session_end_at: c.end_at as string,
    }));

    const mapped = [...fromRegs, ...fromCustom]
      // 僅保留已結束者（歷年 = 已辦完；自訂服務為已完成，天然符合）
      .filter((r) => r.session_end_at && r.session_end_at < nowIso)
      .sort((a, b) => b.session_start_at.localeCompare(a.session_start_at));

    setRows(mapped);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const attendedCount = useMemo(
    () =>
      rows.filter(
        (r) => r.attendance === "attended" || r.attendance === "makeup_attended"
      ).length,
    [rows]
  );

  return (
    <>
      <ProfilePageHeader
        title="歷年活動"
        actions={
          <Link
            href="/profile/certificate"
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">workspace_premium</span>
            服務時數紀錄
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="w-full space-y-5">
          {!isLoading && rows.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-200 pb-4 text-sm text-slate-500">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">history</span>
              歷年參加
              <span className="text-2xl font-bold text-slate-900">{rows.length}</span>
              場，其中出席
              <span className="text-lg font-bold text-slate-900">{attendedCount}</span>場
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span aria-hidden="true" className="material-symbols-outlined animate-spin text-4xl text-primary">
                progress_activity
              </span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <span aria-hidden="true" className="material-symbols-outlined mb-3 block text-5xl text-slate-300">
                event_busy
              </span>
              <p className="mb-4 text-sm text-slate-500">尚無已結束的參加紀錄</p>
              <Link
                href="/volunteer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                前往志工專區
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((reg) => {
                const att =
                  reg.kind === "custom"
                    ? { label: "自訂服務", color: "bg-sky-100 text-sky-700" }
                    : reg.attendance
                      ? ATTENDANCE_MAP[reg.attendance] ?? NOT_RECORDED
                      : NOT_RECORDED;
                const goDetail = () =>
                  router.push(
                    reg.kind === "custom"
                      ? "/profile/custom-service"
                      : `/profile/registrations/${reg.id}`
                  );
                return (
                  <li key={`${reg.kind}:${reg.id}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={goDetail}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goDetail();
                        }
                      }}
                      className="group flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900 group-hover:text-primary">
                            {reg.activity_title}
                          </h3>
                          <span
                            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${att.color}`}
                          >
                            {att.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                              calendar_today
                            </span>
                            {formatSessionRange(reg.session_start_at, reg.session_end_at)}
                          </span>
                          {reg.activity_location && (
                            <span className="inline-flex items-center gap-1">
                              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                                location_on
                              </span>
                              {reg.activity_location}
                            </span>
                          )}
                          {(reg.attendance === "attended" ||
                            reg.attendance === "makeup_attended") &&
                            reg.service_hours != null && (
                              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">timer</span>
                                服務 {reg.service_hours} 小時
                              </span>
                            )}
                        </div>
                      </div>
                      <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[18px] text-slate-300 transition-colors group-hover:text-primary">
                        arrow_forward
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
