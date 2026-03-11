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
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toastSupabaseError } from "@/lib/ui/toast-actions";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminPanel,
} from "@/components/shells/admin-page-shell";

interface ActivityRow {
  id: string;
  title: string;
  content: string;
  activity_date: string;
  activity_time: string;
  location: string;
  capacity: number;
  manager_name: string;
  cancel_deadline: string;
  is_cancelled: boolean | null;
  created_at: string;
  registered_count: number;
}

interface RegistrationRow {
  id: string;
  volunteer_id: string;
  status: string;
  created_at: string;
  volunteer_name: string;
  volunteer_email: string;
}

const REG_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  pending: { label: "待審核", dot: "bg-amber-500", text: "text-amber-600" },
  approved: { label: "已通過", dot: "bg-emerald-500", text: "text-emerald-600" },
  rejected: { label: "未通過", dot: "bg-rose-500", text: "text-rose-600" },
  cancelled: { label: "已取消", dot: "bg-slate-400", text: "text-slate-500" },
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
});

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

    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setActivities([]);
      toastSupabaseError(toast, "活動載入失敗", error);
      setIsLoading(false);
      return;
    }

    const withCounts = await Promise.all(
      (data || []).map(async (activity: any) => {
        const { count } = await supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("activity_id", activity.id)
          .in("status", ["pending", "approved"]);

        return { ...activity, registered_count: count ?? 0 } as ActivityRow;
      })
    );

    setActivities(withCounts);
    setIsLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleCancelActivity = async (id: string) => {
    setConfirmCancelId(id);
  };

  const confirmCancelActivity = async () => {
    if (!confirmCancelId) return;
    setIsCancelling(true);
    const { error } = await supabase
      .from("activities")
      .update({ is_cancelled: true })
      .eq("id", confirmCancelId);
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

  const handleRestoreActivity = async (id: string) => {
    const { error } = await supabase
      .from("activities")
      .update({ is_cancelled: false })
      .eq("id", id);
    if (error) {
      toastSupabaseError(toast, "恢復失敗", error);
      return;
    }
    toast.success("活動已恢復");
    loadActivities();
  };

  const filteredActivities = activities.filter((activity) => {
    const isCancelled = activity.is_cancelled === true;
    if (statusFilter === "active" && isCancelled) return false;
    if (statusFilter === "cancelled" && !isCancelled) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.title.toLowerCase().includes(query) ||
      activity.manager_name.toLowerCase().includes(query) ||
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
      label: "進行中活動",
      value: activities.filter((activity) => activity.is_cancelled !== true).length.toLocaleString(),
      description: "可持續管理與查看報名",
      icon: "event_available",
      accent: "bg-sky-100 text-sky-700",
    },
    {
      label: "已取消活動",
      value: activities.filter((activity) => activity.is_cancelled === true).length.toLocaleString(),
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
                placeholder="搜尋活動名稱、負責人、地點..."
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
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
              <span className="material-symbols-outlined text-[18px] text-slate-400">filter_list</span>
              <span>狀態</span>
              <select
                className="border-none bg-transparent pr-7 text-sm font-semibold text-slate-700 focus:ring-0"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">全部</option>
                <option value="active">進行中</option>
                <option value="cancelled">已取消</option>
              </select>
            </label>
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
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">負責人</th>
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
                      const isCancelled = activity.is_cancelled === true;
                      const isFull = activity.capacity > 0 && activity.registered_count >= activity.capacity;

                      return (
                        <tr key={activity.id} className="transition-colors hover:bg-slate-50/60">
                          <td className="px-6 py-4">
                            <div className="min-w-[16rem]">
                              <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {activity.content.length > 80 ? `${activity.content.slice(0, 80)}...` : activity.content}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-slate-700">{activity.manager_name}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              建立於 {new Date(activity.created_at).toLocaleDateString("zh-TW")}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="min-w-[13rem]">
                              <p className="text-sm font-medium text-slate-700">
                                {activity.activity_date} {activity.activity_time}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">{activity.location}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="min-w-[12rem]">
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
                          <td className="px-6 py-4">
                            {isCancelled ? (
                              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                                已取消
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                進行中
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setViewingRegistrations(activity)}
                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary"
                                title="查看報名清單"
                              >
                                <span className="material-symbols-outlined text-[20px]">list_alt</span>
                              </button>
                              <button
                                onClick={() => setEditingActivity(activity)}
                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary"
                                title="編輯活動"
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                              {isCancelled ? (
                                <button
                                  onClick={() => handleRestoreActivity(activity.id)}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500"
                                  title="恢復活動"
                                >
                                  <span className="material-symbols-outlined text-[20px]">undo</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleCancelActivity(activity.id)}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                                  title="取消活動"
                                >
                                  <span className="material-symbols-outlined text-[20px]">cancel</span>
                                </button>
                              )}
                            </div>
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
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmCancelId}
        title="確定要取消此活動嗎？"
        description="取消後，志工將無法再報名此活動（既有資料仍會保留）。"
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
  const [form, setForm] = useState({
    title: activity?.title || "",
    content: activity?.content || "",
    activity_date: activity?.activity_date || "",
    activity_time: activity?.activity_time || "",
    location: activity?.location || "",
    capacity: activity?.capacity?.toString() || "",
    manager_name: activity?.manager_name || "",
    cancel_deadline: activity?.cancel_deadline || "",
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    const payload = {
      title: form.title,
      content: form.content,
      activity_date: form.activity_date,
      activity_time: form.activity_time,
      location: form.location,
      capacity: parseInt(form.capacity, 10),
      manager_name: form.manager_name,
      cancel_deadline: form.cancel_deadline,
    };

    if (!payload.title.trim()) {
      toast.error("請輸入活動名稱。");
      setIsSubmitting(false);
      return;
    }
    if (!payload.content.trim()) {
      toast.error("請輸入活動內容。");
      setIsSubmitting(false);
      return;
    }
    if (!payload.activity_date) {
      toast.error("請選擇活動日期。");
      setIsSubmitting(false);
      return;
    }
    if (!payload.activity_time) {
      toast.error("請選擇活動時間。");
      setIsSubmitting(false);
      return;
    }
    if (!payload.location.trim()) {
      toast.error("請輸入活動地點。");
      setIsSubmitting(false);
      return;
    }
    if (!Number.isFinite(payload.capacity) || payload.capacity <= 0) {
      toast.error("人數上限需為大於 0 的數字。");
      setIsSubmitting(false);
      return;
    }
    if (!payload.manager_name.trim()) {
      toast.error("請輸入負責人。");
      setIsSubmitting(false);
      return;
    }
    if (!payload.cancel_deadline) {
      toast.error("請選擇最晚取消日。");
      setIsSubmitting(false);
      return;
    }
    if (payload.cancel_deadline > payload.activity_date) {
      toast.error("最晚取消日不可晚於活動日期。");
      setIsSubmitting(false);
      return;
    }

    if (isEditing) {
      const { error } = await supabase.from("activities").update(payload).eq("id", activity.id);
      if (error) {
        toast.error(`更新失敗：${error.message}`);
        setIsSubmitting(false);
        return;
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

      const { error } = await supabase.from("activities").insert({
        ...payload,
        publisher_id: user.id,
        is_cancelled: false,
      });

      if (error) {
        toast.error(`建立失敗：${error.message}`);
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="活動日期">
                <input
                  name="activity_date"
                  type="date"
                  value={form.activity_date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
              <Field label="活動時間">
                <input
                  name="activity_time"
                  type="time"
                  value={form.activity_time}
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="負責人">
                <input
                  name="manager_name"
                  value={form.manager_name}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
              <Field label="最晚取消日">
                <input
                  name="cancel_deadline"
                  type="date"
                  value={form.cancel_deadline}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
            </div>

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
}: {
  activity: ActivityRow;
  onClose: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const loadRegistrations = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("registrations")
      .select("id, volunteer_id, status, created_at, profiles:volunteer_id(full_name, email)")
      .eq("activity_id", activity.id)
      .order("created_at", { ascending: sortOrder === "oldest" });

    setRegistrations(
      (data || []).map((registration: any) => ({
        id: registration.id,
        volunteer_id: registration.volunteer_id,
        status: registration.status,
        created_at: registration.created_at,
        volunteer_name: registration.profiles?.full_name || "未知",
        volunteer_email: registration.profiles?.email || "",
      }))
    );
    setIsLoading(false);
  }, [activity.id, sortOrder, supabase]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  const updateStatus = async (registration: RegistrationRow, newStatus: string) => {
    const isOccupyingBefore = ["pending", "approved"].includes(registration.status);
    const isOccupyingAfter = ["pending", "approved"].includes(newStatus);

    if (activity.is_cancelled && newStatus === "approved") {
      toast.error("活動已取消，無法通過報名。");
      return;
    }

    if (!isOccupyingBefore && isOccupyingAfter) {
      const { count, error: countError } = await supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("activity_id", activity.id)
        .in("status", ["pending", "approved"]);

      if (countError) {
        toastSupabaseError(toast, "檢查名額失敗", countError);
        return;
      }

      if ((count ?? 0) >= activity.capacity) {
        toast.error("此活動名額已滿，無法再通過報名。");
        return;
      }
    }

    const label = newStatus === "approved" ? "通過" : "拒絕";
    const { error } = await supabase
      .from("registrations")
      .update({ status: newStatus })
      .eq("id", registration.id);

    if (error) {
      toastSupabaseError(toast, "操作失敗", error);
      return;
    }

    toast.success(`已${label}「${registration.volunteer_name}」的報名`);
    loadRegistrations();
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
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 p-6">
            <div>
              <h3 className="text-lg font-bold">{activity.title}</h3>
              <p className="text-sm text-slate-500">
                {activity.activity_date} · {activity.location} · 上限 {activity.capacity} 人
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-4 border-b border-slate-100 px-6 py-3">
            <span className="text-sm text-slate-500">
              共 <span className="font-bold text-slate-700">{registrations.length}</span> 筆報名
            </span>
            {statusCounts.pending ? <StatusCount label="待審核" count={statusCounts.pending} color="bg-amber-500 text-amber-600" /> : null}
            {statusCounts.approved ? <StatusCount label="已通過" count={statusCounts.approved} color="bg-emerald-500 text-emerald-600" /> : null}
            {statusCounts.rejected ? <StatusCount label="未通過" count={statusCounts.rejected} color="bg-rose-500 text-rose-600" /> : null}
            <div className="flex items-center gap-2 sm:ml-auto">
              <label htmlFor="registration-sort" className="text-xs font-semibold text-slate-500">排序</label>
              <select
                id="registration-sort"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
              >
                <option value="newest">最新報名</option>
                <option value="oldest">最早報名</option>
              </select>
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
                      className="flex flex-col items-start gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-primary">
                        {registration.volunteer_name.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{registration.volunteer_name}</p>
                        <p className="truncate text-xs text-slate-500">{registration.volunteer_email}</p>
                      </div>
                      <div className="flex-shrink-0 text-xs text-slate-400">
                        報名於 {DATE_TIME_FORMATTER.format(new Date(registration.created_at))}
                      </div>
                      <span className={`flex flex-shrink-0 items-center gap-1.5 text-xs font-bold ${status.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                        <Link
                          href={`/admin/users/${registration.volunteer_id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          查看檔案
                        </Link>
                        {isPending ? (
                          <>
                            <button
                              onClick={() => updateStatus(registration, "approved")}
                              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                              通過
                            </button>
                            <button
                              onClick={() => updateStatus(registration, "rejected")}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                            >
                              拒絕
                            </button>
                          </>
                        ) : registration.status === "approved" ? (
                          <button
                            onClick={() => updateStatus(registration, "rejected")}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                          >
                            改為拒絕
                          </button>
                        ) : registration.status === "rejected" ? (
                          <button
                            onClick={() => updateStatus(registration, "approved")}
                            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            改為通過
                          </button>
                        ) : null}
                      </div>
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
