"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toastSupabaseError } from "@/lib/ui/toast-actions";
import {
  batchCheckIn,
  markAttendance,
  reviewRegistration,
} from "@/lib/actions/registrations";
import { toCsv, downloadCsv } from "@/utils/csv";
import type { ActivityStatus, AttendanceStatus } from "@/lib/types/database";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminPanel,
} from "@/components/shells/admin-page-shell";

const REG_STATUS_LABEL: Record<string, string> = {
  pending: "待審核",
  approved: "已通過",
  rejected: "未通過",
  cancel_pending: "取消審核中",
  cancelled: "已取消",
  expired: "已過期",
};

const ATTENDANCE_LABEL: Record<string, string> = {
  attended: "出席",
  absent: "缺席",
  makeup_attended: "補登出席",
};

const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-slate-200 text-slate-600" },
  open: { label: "開放報名", color: "bg-emerald-100 text-emerald-700" },
  closed: { label: "已截止", color: "bg-amber-100 text-amber-700" },
  completed: { label: "已結束", color: "bg-slate-200 text-slate-600" },
  cancelled: { label: "已取消", color: "bg-rose-100 text-rose-700" },
};

interface ActivityRow {
  id: string;
  title: string;
  content: string | null;
  location: string;
  status: ActivityStatus;
  cancel_review_window_days: number;
  created_at: string;
  session_id: string | null;
  start_at: string | null;
  end_at: string | null;
  capacity: number;
  session_cancelled: boolean;
  registered_count: number;
  organizer_name: string;
}

interface RegistrationRow {
  id: string;
  volunteer_id: string;
  status: string;
  created_at: string;
  volunteer_name: string;
  volunteer_email: string;
  attendance: AttendanceStatus | null;
  checked_in_at: string | null;
  service_hours: number | null;
}

const REG_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  pending: { label: "待審核", dot: "bg-amber-500", text: "text-amber-600" },
  approved: { label: "已通過", dot: "bg-emerald-500", text: "text-emerald-600" },
  rejected: { label: "未通過", dot: "bg-rose-500", text: "text-rose-600" },
  cancel_pending: { label: "取消審核中", dot: "bg-amber-500", text: "text-amber-600" },
  cancelled: { label: "已取消", dot: "bg-slate-400", text: "text-slate-500" },
  expired: { label: "已過期", dot: "bg-slate-400", text: "text-slate-500" },
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
});

// V2 的 activities/activity_sessions 是一對多模型，本次「一活動一場次」
// 簡化：建立活動時同時建立唯一一筆場次，前台/後台皆以此場次代表整個活動。
function toTaipeiISOString(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

function toTaipeiDateTimeParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

export default function AdminActivitiesPage() {
  const supabase = createClient();
  const toast = useToast();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityRow | null>(null);
  const [viewingRegistrations, setViewingRegistrations] = useState<ActivityRow | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const loadActivities = useCallback(async () => {
    setIsLoading(true);

    const [{ data, error }, { data: slots }, { data: organizers }] = await Promise.all([
      supabase
        .from("activities")
        .select("*, activity_sessions(*)")
        .order("created_at", { ascending: false }),
      supabase.from("v_session_open_slots").select("*"),
      supabase.from("activity_organizers").select("activity_id, staff_profiles(full_name)"),
    ]);

    if (error) {
      setActivities([]);
      toastSupabaseError(toast, "活動載入失敗", error);
      setIsLoading(false);
      return;
    }

    const slotBySessionId = new Map<string, any>(
      (slots ?? []).map((s: any) => [s.activity_session_id, s])
    );
    const organizerByActivityId = new Map<string, string>(
      (organizers ?? []).map((o: any) => [o.activity_id, o.staff_profiles?.full_name ?? ""])
    );

    const withCounts: ActivityRow[] = (data || []).map((activity: any) => {
      const session = activity.activity_sessions?.[0] ?? null;
      const slot = session ? slotBySessionId.get(session.id) : undefined;
      const capacity = session?.capacity ?? 0;
      const openSlots = slot?.open_slots ?? capacity;

      return {
        id: activity.id,
        title: activity.title,
        content: activity.content,
        location: activity.location,
        status: activity.status,
        cancel_review_window_days: activity.cancel_review_window_days,
        created_at: activity.created_at,
        session_id: session?.id ?? null,
        start_at: session?.start_at ?? null,
        end_at: session?.end_at ?? null,
        capacity,
        session_cancelled: !!session?.cancelled_at,
        registered_count: capacity - openSlots,
        organizer_name: organizerByActivityId.get(activity.id) ?? "",
      };
    });

    setActivities(withCounts);
    setIsLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleCancelActivity = async (id: string) => {
    setConfirmCancelId(id);
  };

  // V2 沒有「恢復活動」路徑：cancelled 為活動狀態機的終態
  // （fn_activity_transition_guard 不允許離開 cancelled）。
  const confirmCancelActivity = async () => {
    if (!confirmCancelId) return;
    setIsCancelling(true);

    // rpc_cancel_activity 內建級聯取消所有尚未開始場次的有效報名並逐筆
    // 通知志工（寫入 notification_outbox），前端不需再自行處理通知。
    const { error } = await supabase.rpc("rpc_cancel_activity", {
      p_activity_id: confirmCancelId,
    });

    if (error) {
      toastSupabaseError(toast, "取消失敗", error);
      setIsCancelling(false);
      return;
    }

    toast.success("活動已取消");
    await loadActivities();
    setIsCancelling(false);
    setConfirmCancelId(null);
  };

  const filteredActivities = activities.filter((activity) => {
    if (statusFilter !== "all" && activity.status !== statusFilter) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.title.toLowerCase().includes(query) ||
      activity.organizer_name.toLowerCase().includes(query) ||
      activity.location.toLowerCase().includes(query)
    );
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const filtersApplied = searchQuery.trim().length > 0 || statusFilter !== "all";
  const metricCards = [
    {
      label: "活動總數",
      value: activities.length.toLocaleString(),
      description: "目前已建立的活動",
      icon: "event_note",
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "開放報名中",
      value: activities.filter((activity) => activity.status === "open").length.toLocaleString(),
      description: "可持續管理與查看報名",
      icon: "event_available",
      accent: "bg-sky-100 text-sky-700",
    },
    {
      label: "已取消活動",
      value: activities.filter((activity) => activity.status === "cancelled").length.toLocaleString(),
      description: "目前已停止的活動",
      icon: "event_busy",
      accent: "bg-rose-100 text-rose-700",
    },
    {
      label: "本月新增",
      value: activities
        .filter((activity) => new Date(activity.created_at) >= monthStart)
        .length.toLocaleString(),
      description: "本月新建立的活動",
      icon: "add_circle",
      accent: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Activity Management"
        title="活動管理"
        description="管理、追蹤並建立志工活動。"
        right={
          <>
            <label className="relative block flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <span className="material-symbols-outlined text-[20px]">search</span>
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
                placeholder="搜尋活動名稱、主辦人、地點..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              新增活動
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <AdminMetricCard key={card.label} {...card} />
          ))}
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
              <span className="material-symbols-outlined text-[18px] text-slate-400">filter_list</span>
              <span>狀態</span>
              <Select
                className="w-auto min-w-[6.5rem]"
                triggerClassName="min-h-0 border-none bg-transparent px-0 py-0 text-sm font-semibold text-slate-700 shadow-none focus:ring-0"
                menuClassName="left-auto right-0 w-max min-w-full"
                value={statusFilter}
                ariaLabel="活動狀態篩選"
                onValueChange={setStatusFilter}
                options={[
                  { value: "all", label: "全部" },
                  { value: "open", label: "開放報名" },
                  { value: "closed", label: "已截止" },
                  { value: "completed", label: "已結束" },
                  { value: "cancelled", label: "已取消" },
                ]}
              />
            </div>
            {filtersApplied ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-primary"
              >
                清除篩選
              </button>
            ) : null}
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600">
            <span className="material-symbols-outlined text-[18px] text-slate-400">inventory_2</span>
            顯示 {filteredActivities.length} / {activities.length} 筆活動
          </div>
        </div>

        <AdminPanel bodyClassName="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">活動</th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">主辦人</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">時間與地點</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">報名進度</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">狀態</th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredActivities.length > 0 ? (
                    filteredActivities.map((activity) => {
                      const occupancyRate =
                        activity.capacity > 0
                          ? Math.round((activity.registered_count / activity.capacity) * 100)
                          : 0;
                      const isFull = activity.capacity > 0 && activity.registered_count >= activity.capacity;
                      const statusInfo = ACTIVITY_STATUS_LABEL[activity.status];

                      return (
                        <tr key={activity.id} className="transition-colors hover:bg-slate-50/60">
                          <td className="px-6 py-4">
                            <div className="max-w-[18rem]">
                              <p className="truncate text-sm font-semibold text-slate-900">{activity.title}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{activity.content}</p>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <p className="text-sm font-medium text-slate-700">{activity.organizer_name || "—"}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="min-w-52">
                              <p className="text-sm font-medium text-slate-700">
                                {activity.start_at
                                  ? DATE_TIME_FORMATTER.format(new Date(activity.start_at))
                                  : "尚未設定場次"}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">{activity.location}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="min-w-48">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full ${occupancyRate >= 100 ? "bg-slate-400" : "bg-primary"}`}
                                    style={{ width: `${Math.min(occupancyRate, 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-semibold text-slate-700">
                                  {activity.registered_count}/{activity.capacity}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">
                                {isFull ? "名額已滿" : `使用率 ${occupancyRate}%`}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setViewingRegistrations(activity)}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                              title="管理活動"
                            >
                              <span className="material-symbols-outlined text-[18px]">tune</span>
                              管理
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                        <span className="material-symbols-outlined mb-2 block text-4xl">search_off</span>
                        {activities.length === 0 ? "目前沒有任何活動" : "找不到符合條件的活動"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && filteredActivities.length > 0 ? (
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <p>顯示 <span className="font-semibold text-slate-700">{filteredActivities.length}</span> 筆活動</p>
                <p>全部共 <span className="font-semibold text-slate-700">{activities.length}</span> 筆</p>
              </div>
            </div>
          ) : null}
        </AdminPanel>
      </div>
      {showCreateModal ? (
        <ActivityFormModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            loadActivities();
            toast.success("活動建立成功");
          }}
        />
      ) : null}

      {editingActivity ? (
        <ActivityFormModal
          activity={editingActivity}
          onClose={() => setEditingActivity(null)}
          onSaved={() => {
            setEditingActivity(null);
            loadActivities();
            toast.success("活動更新成功");
          }}
        />
      ) : null}

      {viewingRegistrations ? (
        <RegistrationsModal
          activity={viewingRegistrations}
          onClose={() => setViewingRegistrations(null)}
          onEdit={(activity) => {
            setViewingRegistrations(null);
            setEditingActivity(activity);
          }}
          onCancel={(activity) => {
            setViewingRegistrations(null);
            handleCancelActivity(activity.id);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmCancelId}
        title="確定要取消此活動嗎？"
        description="取消後無法恢復；尚未開始場次的有效報名將自動取消並通知志工，已結束/進行中場次的出席紀錄會保留。"
        confirmText="取消活動"
        cancelText="返回"
        isConfirmDanger
        isLoading={isCancelling}
        onClose={() => {
          if (isCancelling) return;
          setConfirmCancelId(null);
        }}
        onConfirm={confirmCancelActivity}
      />
    </>
  );
}

function ActivityFormModal({
  activity,
  onClose,
  onSaved,
}: {
  activity?: ActivityRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const isEditing = Boolean(activity);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingParts = activity?.start_at
    ? toTaipeiDateTimeParts(activity.start_at)
    : { date: "", time: "" };
  const existingEndParts = activity?.end_at
    ? toTaipeiDateTimeParts(activity.end_at)
    : { date: "", time: "" };

  const [form, setForm] = useState({
    title: activity?.title || "",
    content: activity?.content || "",
    location: activity?.location || "",
    activity_date: existingParts.date,
    start_time: existingParts.time,
    end_time: existingEndParts.time,
    capacity: activity?.capacity?.toString() || "",
    cancel_review_window_days: activity?.cancel_review_window_days?.toString() ?? "0",
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!form.title.trim()) {
      toast.error("請輸入活動名稱。");
      setIsSubmitting(false);
      return;
    }
    if (!form.content.trim()) {
      toast.error("請輸入活動內容。");
      setIsSubmitting(false);
      return;
    }
    if (!form.location.trim()) {
      toast.error("請輸入活動地點。");
      setIsSubmitting(false);
      return;
    }
    if (!form.activity_date || !form.start_time || !form.end_time) {
      toast.error("請完整選擇活動日期與起訖時間。");
      setIsSubmitting(false);
      return;
    }

    const capacity = parseInt(form.capacity, 10);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      toast.error("人數上限需為大於 0 的數字。");
      setIsSubmitting(false);
      return;
    }

    const cancelReviewWindowDays = parseInt(form.cancel_review_window_days, 10);
    if (!Number.isFinite(cancelReviewWindowDays) || cancelReviewWindowDays < 0) {
      toast.error("取消審核天數門檻需為 0 以上的數字。");
      setIsSubmitting(false);
      return;
    }

    const startAt = toTaipeiISOString(form.activity_date, form.start_time);
    const endAt = toTaipeiISOString(form.activity_date, form.end_time);

    if (endAt <= startAt) {
      toast.error("結束時間需晚於開始時間。");
      setIsSubmitting(false);
      return;
    }

    if (isEditing && activity) {
      const { error: activityError } = await supabase
        .from("activities")
        .update({
          title: form.title,
          content: form.content,
          location: form.location,
          cancel_review_window_days: cancelReviewWindowDays,
        })
        .eq("id", activity.id);

      if (activityError) {
        toast.error(`更新失敗：${activityError.message}`);
        setIsSubmitting(false);
        return;
      }

      if (activity.session_id) {
        const { error: sessionError } = await supabase
          .from("activity_sessions")
          .update({
            start_at: startAt,
            end_at: endAt,
            capacity,
            registration_deadline_at: startAt,
          })
          .eq("id", activity.session_id);

        if (sessionError) {
          toast.error(`場次更新失敗：${sessionError.message}`);
          setIsSubmitting(false);
          return;
        }
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("請先登入");
        setIsSubmitting(false);
        return;
      }

      const { data: newActivity, error: activityError } = await supabase
        .from("activities")
        .insert({
          created_by: user.id,
          title: form.title,
          content: form.content,
          activity_type: "general",
          location: form.location,
          cancel_review_window_days: cancelReviewWindowDays,
        })
        .select("id")
        .single();

      if (activityError || !newActivity) {
        toast.error(`建立失敗：${activityError?.message ?? "未知錯誤"}`);
        setIsSubmitting(false);
        return;
      }

      const { error: sessionError } = await supabase.from("activity_sessions").insert({
        activity_id: newActivity.id,
        start_at: startAt,
        end_at: endAt,
        capacity,
        registration_deadline_at: startAt,
      });

      if (sessionError) {
        toast.error(`場次建立失敗：${sessionError.message}（活動已建立為草稿，請編輯後重試）`);
        setIsSubmitting(false);
        return;
      }

      await supabase.from("activity_organizers").insert({
        activity_id: newActivity.id,
        staff_id: user.id,
      });

      // 已有一個有效場次，可從草稿轉為開放報名
      const { error: openError } = await supabase
        .from("activities")
        .update({ status: "open" })
        .eq("id", newActivity.id);

      if (openError) {
        toast.error(`活動已建立，但開放報名失敗：${openError.message}`);
        setIsSubmitting(false);
        return;
      }
    }

    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-8">
        <div
          className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 p-6">
            <h3 className="text-xl font-bold">{isEditing ? "編輯活動" : "新增活動"}</h3>
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            <Field label="活動名稱">
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </Field>
            <Field label="活動內容">
              <textarea
                name="content"
                rows={3}
                value={form.content}
                onChange={handleChange}
                className="w-full resize-none rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="活動日期">
                <input
                  name="activity_date"
                  type="date"
                  value={form.activity_date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
              <Field label="開始時間">
                <input
                  name="start_time"
                  type="time"
                  value={form.start_time}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
              <Field label="結束時間">
                <input
                  name="end_time"
                  type="time"
                  value={form.end_time}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="活動地點">
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
              <Field label="人數上限">
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
            </div>
            <Field label="取消審核天數門檻">
              <input
                name="cancel_review_window_days"
                type="number"
                min="0"
                value={form.cancel_review_window_days}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-slate-400">
                活動開始前幾天內申請取消需經審核；0 = 任何時候取消都需審核。
              </p>
            </Field>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : null}
                {isEditing ? "儲存變更" : "建立活動"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function RegistrationsModal({
  activity,
  onClose,
  onEdit,
  onCancel,
}: {
  activity: ActivityRow;
  onClose: () => void;
  onEdit: (activity: ActivityRow) => void;
  onCancel: (activity: ActivityRow) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  const loadRegistrations = useCallback(async () => {
    if (!activity.session_id) {
      setRegistrations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data } = await supabase
      .from("registrations")
      .select(
        "id, volunteer_id, status, created_at, attendance, checked_in_at, service_hours, volunteer_profiles:volunteer_id(full_name, email)"
      )
      .eq("activity_session_id", activity.session_id)
      .order("created_at", { ascending: sortOrder === "oldest" });

    setRegistrations(
      (data || []).map((registration: any) => ({
        id: registration.id,
        volunteer_id: registration.volunteer_id,
        status: registration.status,
        created_at: registration.created_at,
        volunteer_name: registration.volunteer_profiles?.full_name || "未知",
        volunteer_email: registration.volunteer_profiles?.email || "",
        attendance: registration.attendance ?? null,
        checked_in_at: registration.checked_in_at ?? null,
        service_hours: registration.service_hours == null ? null : Number(registration.service_hours),
      }))
    );
    setIsLoading(false);
  }, [activity.session_id, sortOrder, supabase]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  // 待審核 → 通過／拒絕。V2 的名額為「待審核即佔額」，approve 不會消耗
  // 新名額（pending 時已計入），故不需前端重新檢查容量。已審核過的報名
  // 是終態，不提供「改判」——這是 V2 狀態機的刻意設計（見規格書 6.2）。
  const updateStatus = async (registration: RegistrationRow, approve: boolean) => {
    const result = await reviewRegistration(registration.id, approve);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`已${approve ? "通過" : "拒絕"}「${registration.volunteer_name}」的報名`);
    loadRegistrations();
  };

  const handleMarkAttendance = async (
    registration: RegistrationRow,
    attendance: "attended" | "absent"
  ) => {
    setSavingId(registration.id);
    const result = await markAttendance(registration.id, attendance);
    setSavingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    await loadRegistrations();
  };

  const handleBatchCheckIn = async () => {
    const approvedIds = registrations
      .filter((r) => r.status === "approved")
      .map((r) => r.id);

    if (approvedIds.length === 0) {
      toast.error("沒有已通過的報名可標記出席。");
      return;
    }

    setIsBatchSaving(true);
    const result = await batchCheckIn(approvedIds);
    setIsBatchSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`已將 ${approvedIds.length} 位已通過志工標記為出席`);
    await loadRegistrations();
  };

  const approvedCount = registrations.filter((r) => r.status === "approved").length;
  const totalHours = registrations.reduce(
    (sum, r) =>
      sum + (r.attendance === "attended" || r.attendance === "makeup_attended" ? Number(r.service_hours ?? 0) : 0),
    0
  );

  const handleExportCsv = () => {
    const headers = [
      "姓名",
      "電子郵件",
      "報名狀態",
      "出席",
      "服務時數",
      "報名時間",
    ];
    const rows = registrations.map((r) => [
      r.volunteer_name,
      r.volunteer_email,
      REG_STATUS_LABEL[r.status] ?? r.status,
      r.attendance ? ATTENDANCE_LABEL[r.attendance] ?? r.attendance : "",
      r.attendance === "attended" || r.attendance === "makeup_attended"
        ? (r.service_hours ?? "")
        : "",
      new Date(r.created_at).toLocaleString("zh-TW"),
    ]);
    const safeTitle = activity.title.replace(/[\\/:*?"<>|]/g, "_");
    const dateLabel = activity.start_at ? activity.start_at.slice(0, 10) : "";
    downloadCsv(`報名名單_${safeTitle}_${dateLabel}`, toCsv(headers, rows));
  };

  const statusCounts = registrations.reduce(
    (acc, registration) => {
      acc[registration.status] = (acc[registration.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-8">
        <div
          className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-lg font-bold">{activity.title}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ACTIVITY_STATUS_LABEL[activity.status].color}`}
                >
                  {ACTIVITY_STATUS_LABEL[activity.status].label}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {activity.start_at ? DATE_TIME_FORMATTER.format(new Date(activity.start_at)) : "尚未設定場次"}
                {" · "}
                {activity.location} · 上限 {activity.capacity} 人
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => onEdit(activity)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                <span className="hidden sm:inline">編輯</span>
              </button>
              {activity.status !== "cancelled" ? (
                <button
                  onClick={() => onCancel(activity)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  <span className="hidden sm:inline">取消活動</span>
                </button>
              ) : null}
              <button
                onClick={onClose}
                className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-6 py-3">
            <div className="scroll-x flex min-w-0 flex-1 items-center gap-4">
              <span className="text-sm text-slate-500 whitespace-nowrap">
                共 <span className="font-bold text-slate-700">{registrations.length}</span> 筆報名
              </span>
              {statusCounts.pending ? <StatusCount label="待審核" count={statusCounts.pending} color="bg-amber-500 text-amber-600" /> : null}
              {statusCounts.approved ? <StatusCount label="已通過" count={statusCounts.approved} color="bg-emerald-500 text-emerald-600" /> : null}
              {statusCounts.rejected ? <StatusCount label="未通過" count={statusCounts.rejected} color="bg-rose-500 text-rose-600" /> : null}
              {totalHours > 0 ? (
                <span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  累計時數 {totalHours}
                </span>
              ) : null}
              {approvedCount > 0 ? (
                <button
                  onClick={handleBatchCheckIn}
                  disabled={isBatchSaving}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
                >
                  {isBatchSaving ? (
                    <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[14px]">how_to_reg</span>
                  )}
                  批次標記出席
                </button>
              ) : null}
              {registrations.length > 0 ? (
                <button
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[14px]">download</span>
                  匯出 CSV
                </button>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-xs font-semibold text-slate-500 sm:inline">排序</span>
              <Select
                id="registration-sort"
                className="w-auto min-w-[6.75rem]"
                triggerClassName="min-h-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/20"
                menuClassName="left-auto right-0 w-max min-w-full"
                value={sortOrder}
                ariaLabel="報名排序"
                onValueChange={(value) => setSortOrder(value as "newest" | "oldest")}
                options={[
                  { value: "newest", label: "最新報名" },
                  { value: "oldest", label: "最早報名" },
                ]}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
              </div>
            ) : registrations.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <span className="material-symbols-outlined mb-2 block text-4xl">inbox</span>
                目前沒有報名紀錄
              </div>
            ) : (
              <div className="space-y-3">
                {registrations.map((registration) => {
                  const status = REG_STATUS[registration.status] || REG_STATUS.pending;
                  const isPending = registration.status === "pending";

                  return (
                    <div
                      key={registration.id}
                      className="rounded-lg border border-slate-200 transition-colors hover:border-slate-300"
                    >
                    <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-primary">
                        {registration.volunteer_name.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{registration.volunteer_name}</p>
                        <p className="truncate text-xs text-slate-500">{registration.volunteer_email}</p>
                      </div>
                      <div className="shrink-0 text-xs text-slate-400">
                        報名於 {DATE_TIME_FORMATTER.format(new Date(registration.created_at))}
                      </div>
                      <span className={`flex shrink-0 items-center gap-1.5 text-xs font-bold ${status.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <Link
                          href={`/admin/users/${registration.volunteer_id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          查看檔案
                        </Link>
                        {isPending ? (
                          <>
                            <button
                              onClick={() => updateStatus(registration, true)}
                              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                              通過
                            </button>
                            <button
                              onClick={() => updateStatus(registration, false)}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                            >
                              拒絕
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {registration.status === "approved" ? (
                      <AttendanceControls
                        registration={registration}
                        isSaving={savingId === registration.id}
                        onMark={handleMarkAttendance}
                      />
                    ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ATTENDANCE_OPTIONS: {
  value: "attended" | "absent";
  label: string;
  active: string;
}[] = [
  { value: "attended", label: "出席", active: "bg-emerald-600 text-white" },
  { value: "absent", label: "缺席", active: "bg-rose-500 text-white" },
];

function AttendanceControls({
  registration,
  isSaving,
  onMark,
}: {
  registration: RegistrationRow;
  isSaving: boolean;
  onMark: (registration: RegistrationRow, attendance: "attended" | "absent") => void;
}) {
  return (
    <div className="scroll-x flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <span className="text-xs font-semibold text-slate-500">出席</span>
      {ATTENDANCE_OPTIONS.map((option) => {
        const isActive = registration.attendance === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onMark(registration, option.value)}
            disabled={isSaving}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
              isActive
                ? option.active
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}

      {registration.attendance === "attended" && registration.service_hours != null ? (
        <span className="text-xs font-semibold text-primary">
          服務時數 {registration.service_hours} 小時（依場次時長自動帶入）
        </span>
      ) : null}

      {registration.checked_in_at ? (
        <span className="ml-auto text-[11px] text-slate-400">
          簽到於 {DATE_TIME_FORMATTER.format(new Date(registration.checked_in_at))}
        </span>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function StatusCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  const [dotClass, textClass] = color.split(" ");

  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${textClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label} {count}
    </span>
  );
}
