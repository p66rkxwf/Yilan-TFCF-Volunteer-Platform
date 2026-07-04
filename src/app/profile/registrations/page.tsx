"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/components/auth-provider";
import { cancelRegistration } from "@/lib/actions/registrations";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

interface RegistrationRow {
  id: string;
  status: string;
  created_at: string;
  activity_title: string;
  session_start_at: string | null;
  activity_location: string;
  attendance: string | null;
  service_hours: number | null;
}

const ATTENDANCE_MAP: Record<string, { label: string; color: string }> = {
  attended: { label: "已出席", color: "bg-emerald-100 text-emerald-700" },
  absent: { label: "缺席", color: "bg-rose-100 text-rose-700" },
  makeup_attended: { label: "已出席（補登）", color: "bg-emerald-100 text-emerald-700" },
};

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: "待審核", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  approved: { label: "已通過", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "未通過", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
  cancel_pending: { label: "取消審核中", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  cancelled: { label: "已取消", color: "bg-slate-200 text-slate-600", dot: "bg-slate-400" },
  expired: { label: "已過期", color: "bg-slate-200 text-slate-600", dot: "bg-slate-400" },
};

const FILTER_TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待審核" },
  { key: "approved", label: "已通過" },
  { key: "rejected", label: "未通過" },
  { key: "cancel_pending", label: "取消審核中" },
  { key: "cancelled", label: "已取消" },
];

export default function RegistrationsPage() {
  const supabase = createClient();
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [confirmCancelReg, setConfirmCancelReg] = useState<RegistrationRow | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const loadRegistrations = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("registrations")
      .select(
        "id, status, created_at, attendance, service_hours, activity_sessions(start_at, activities(title, location))"
      )
      .eq("volunteer_id", user.id)
      .order("created_at", { ascending: false });

    const mapped: RegistrationRow[] = (data || []).map((r: any) => {
      const session = r.activity_sessions;
      return {
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        activity_title: session?.activities?.title || "未知活動",
        session_start_at: session?.start_at || null,
        activity_location: session?.activities?.location || "",
        attendance: r.attendance ?? null,
        service_hours: r.service_hours == null ? null : Number(r.service_hours),
      };
    });

    setRegistrations(mapped);
    setIsLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    loadRegistrations();
  }, [loadRegistrations, authLoading, user]);

  const handleCancel = (reg: RegistrationRow) => {
    setConfirmCancelReg(reg);
  };

  // V2 沒有固定的「最晚取消日」硬性擋點：申請一律送出，由 RPC
  // （rpc_request_cancel）依活動的取消審核天數門檻決定是立即取消
  // 還是進入審核佇列（cancel_pending）。
  const confirmCancel = async () => {
    if (!confirmCancelReg) return;
    setIsCancelling(true);

    const result = await cancelRegistration(confirmCancelReg.id);

    if (result.error) {
      toast.error(result.error);
    } else if (result.status === "cancel_pending") {
      toast.success(`「${confirmCancelReg.activity_title}」的取消申請已送出，待審核。`);
      await loadRegistrations();
    } else {
      toast.success(`已取消「${confirmCancelReg.activity_title}」的報名`);
      await loadRegistrations();
    }

    setIsCancelling(false);
    setConfirmCancelReg(null);
  };

  const filtered = filter === "all"
    ? registrations
    : registrations.filter((r) => r.status === filter);

  const counts = registrations.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const attendedRegistrations = registrations.filter(
    (r) => r.attendance === "attended" || r.attendance === "makeup_attended"
  );
  const totalHours = attendedRegistrations.reduce((sum, r) => sum + Number(r.service_hours ?? 0), 0);

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 md:px-8 shrink-0">
        <h1 className="text-lg font-bold">我的報名</h1>
        <Link
          href="/volunteer"
          className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-lg font-semibold text-sm hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          瀏覽活動
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Hours summary */}
          {!isLoading && totalHours > 0 ? (
            <div className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined">timer</span>
                </div>
                <div>
                  <p className="text-sm text-slate-500">累計服務時數</p>
                  <p className="text-2xl font-black text-slate-900">
                    {totalHours} <span className="text-base font-bold text-slate-500">小時</span>
                    <span className="ml-2 text-sm font-semibold text-slate-400">
                      · {attendedRegistrations.length} 場活動
                    </span>
                  </p>
                </div>
              </div>
              <Link
                href="/profile/certificate"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
                服務證明
              </Link>
            </div>
          ) : null}

          {/* Filter Tabs */}
          <div className="scroll-x flex gap-2 pb-1">
            {FILTER_TABS.map((tab) => {
              const count = tab.key === "all" ? registrations.length : (counts[tab.key] || 0);
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    filter === tab.key
                      ? "bg-primary text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 ${filter === tab.key ? "text-white/70" : "text-slate-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                progress_activity
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl text-slate-300 block mb-3">
                inbox
              </span>
              <p className="text-slate-500 mb-4">
                {registrations.length === 0 ? "還沒有任何報名紀錄" : "此分類沒有報名紀錄"}
              </p>
              <Link
                href="/volunteer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                前往志工專區
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((reg) => {
                const s = STATUS_MAP[reg.status] || STATUS_MAP.pending;
                const canCancel = reg.status === "pending" || reg.status === "approved";

                return (
                  <div
                    key={reg.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center gap-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-900 truncate">
                          {reg.activity_title}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.color} shrink-0`}>
                          {s.label}
                        </span>
                        {reg.attendance && ATTENDANCE_MAP[reg.attendance] ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${ATTENDANCE_MAP[reg.attendance].color}`}>
                            {ATTENDANCE_MAP[reg.attendance].label}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                        {reg.session_start_at && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {DATE_FORMATTER.format(new Date(reg.session_start_at))}
                          </span>
                        )}
                        {reg.activity_location && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                            {reg.activity_location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">schedule</span>
                          報名於 {new Date(reg.created_at).toLocaleDateString("zh-TW")}
                        </span>
                        {(reg.attendance === "attended" || reg.attendance === "makeup_attended") && reg.service_hours != null ? (
                          <span className="flex items-center gap-1 font-semibold text-primary">
                            <span className="material-symbols-outlined text-[14px]">timer</span>
                            服務 {reg.service_hours} 小時
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {canCancel && (
                      <button
                        onClick={() => handleCancel(reg)}
                        className="shrink-0 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
                      >
                        取消報名
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmCancelReg}
        title={confirmCancelReg ? `確定要取消「${confirmCancelReg.activity_title}」的報名嗎？` : ""}
        description="視活動的取消審核門檻，取消申請可能會立即生效，也可能需要主辦人審核後才會生效。"
        confirmText="取消報名"
        cancelText="返回"
        isConfirmDanger
        isLoading={isCancelling}
        onClose={() => {
          if (isCancelling) return;
          setConfirmCancelReg(null);
        }}
        onConfirm={confirmCancel}
      />
    </>
  );
}
