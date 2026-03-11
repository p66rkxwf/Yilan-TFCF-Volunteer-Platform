"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toastSupabaseError } from "@/lib/ui/toast-actions";

interface RegistrationRow {
  id: string;
  activity_id: string;
  status: string;
  created_at: string;
  activity_title: string;
  activity_date: string;
  activity_location: string;
  cancel_deadline: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: "待審核", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  approved: { label: "已通過", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "未通過", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
  cancelled: { label: "已取消", color: "bg-slate-200 text-slate-600", dot: "bg-slate-400" },
};

const FILTER_TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待審核" },
  { key: "approved", label: "已通過" },
  { key: "rejected", label: "未通過" },
  { key: "cancelled", label: "已取消" },
];

export default function RegistrationsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [confirmCancelReg, setConfirmCancelReg] = useState<RegistrationRow | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const loadRegistrations = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("registrations")
      .select("id, activity_id, status, created_at, activities(title, activity_date, location, cancel_deadline)")
      .eq("volunteer_id", user.id)
      .order("created_at", { ascending: false });

    const mapped: RegistrationRow[] = (data || []).map((r: any) => ({
      id: r.id,
      activity_id: r.activity_id,
      status: r.status,
      created_at: r.created_at,
      activity_title: r.activities?.title || "未知活動",
      activity_date: r.activities?.activity_date || "",
      activity_location: r.activities?.location || "",
      cancel_deadline: r.activities?.cancel_deadline || "",
    }));

    setRegistrations(mapped);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  const handleCancel = async (reg: RegistrationRow) => {
    const today = new Date().toISOString().split("T")[0];
    if (reg.cancel_deadline && today > reg.cancel_deadline) {
      toast.error(`已超過最晚取消日（${reg.cancel_deadline}），無法取消。`);
      return;
    }
    setConfirmCancelReg(reg);
  };

  const confirmCancel = async () => {
    if (!confirmCancelReg) return;
    setIsCancelling(true);

    const { error } = await supabase
      .from("registrations")
      .update({ status: "cancelled" })
      .eq("id", confirmCancelReg.id);

    if (error) {
      toastSupabaseError(toast, "取消失敗", error);
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
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2">
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
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                        {reg.activity_date && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {reg.activity_date}
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
        description="取消後可再重新報名，但仍需依名額與審核流程為準。"
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
