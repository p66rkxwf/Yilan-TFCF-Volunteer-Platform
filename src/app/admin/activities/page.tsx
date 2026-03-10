"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

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
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadActivities = useCallback(async () => {
    let query = supabase.from("activities").select("*");

    if (statusFilter === "active") {
      query = query.or("is_cancelled.eq.false,is_cancelled.is.null");
    } else if (statusFilter === "cancelled") {
      query = query.eq("is_cancelled", true);
    }

    const { data: acts } = await query.order("created_at", { ascending: false });

    if (!acts) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    const withCounts: ActivityRow[] = await Promise.all(
      acts.map(async (a: any) => {
        const { count } = await supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("activity_id", a.id)
          .in("status", ["pending", "approved"]);
        return { ...a, registered_count: count ?? 0 };
      })
    );

    setActivities(withCounts);
    setIsLoading(false);
  }, [supabase, statusFilter]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    if (actionMsg) {
      if (actionMsg.type === "success") {
        toast.success(actionMsg.text);
      } else {
        toast.error(actionMsg.text);
      }
      setActionMsg(null);
    }
  }, [actionMsg, toast]);

  const handleCancelActivity = async (id: string) => {
    if (!confirm("確定要取消此活動嗎？")) return;
    const { error } = await supabase.from("activities").update({ is_cancelled: true }).eq("id", id);
    if (error) {
      setActionMsg({ type: "error", text: `取消失敗：${error.message}` });
    } else {
      setActionMsg({ type: "success", text: "活動已取消" });
      loadActivities();
    }
  };

  const handleRestoreActivity = async (id: string) => {
    const { error } = await supabase.from("activities").update({ is_cancelled: false }).eq("id", id);
    if (error) {
      setActionMsg({ type: "error", text: `恢復失敗：${error.message}` });
    } else {
      setActionMsg({ type: "success", text: "活動已恢復" });
      loadActivities();
    }
  };

  const filtered = activities.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.manager_name.toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <header className="bg-white border-b border-slate-200 p-6 flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">活動管理</h2>
            <p className="text-sm text-slate-500">管理、追蹤並建立志工活動。</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            新增活動
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Search & Filters */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input
                className="w-full pl-10 pr-4 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/50 text-sm"
                placeholder="搜尋活動名稱、負責人..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <select
            className="bg-background-light border-none rounded-lg text-sm px-4 py-2 focus:ring-2 focus:ring-primary/50"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setIsLoading(true);
            }}
          >
            <option value="all">全部狀態</option>
            <option value="active">進行中</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">活動名稱</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">負責人</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">日期</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">報名人數</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">狀態</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length > 0 ? (
                    filtered.map((a) => {
                      const pct = a.capacity > 0 ? Math.round((a.registered_count / a.capacity) * 100) : 0;
                      const isCancelled = a.is_cancelled === true;

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium">{a.title}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{a.manager_name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{a.activity_date}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 100 ? "bg-slate-400" : "bg-primary"}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium">{a.registered_count}/{a.capacity}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {isCancelled ? (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">已取消</span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">進行中</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setViewingRegistrations(a)}
                                className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                                title="查看報名清單"
                              >
                                <span className="material-symbols-outlined text-[20px]">list_alt</span>
                              </button>
                              <button
                                onClick={() => setEditingActivity(a)}
                                className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                                title="編輯活動"
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                              {isCancelled ? (
                                <button
                                  onClick={() => handleRestoreActivity(a.id)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-500 transition-colors"
                                  title="恢復活動"
                                >
                                  <span className="material-symbols-outlined text-[20px]">undo</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleCancelActivity(a.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
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
                        <span className="material-symbols-outlined text-4xl mb-2 block">search_off</span>
                        {activities.length === 0 ? "目前沒有任何活動" : "找不到符合條件的活動"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <p className="text-sm text-slate-500">共 {filtered.length} 筆活動</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <ActivityFormModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            setIsLoading(true);
            loadActivities();
            setActionMsg({ type: "success", text: "活動建立成功" });
          }}
        />
      )}

      {editingActivity && (
        <ActivityFormModal
          activity={editingActivity}
          onClose={() => setEditingActivity(null)}
          onSaved={() => {
            setEditingActivity(null);
            setIsLoading(true);
            loadActivities();
            setActionMsg({ type: "success", text: "活動更新成功" });
          }}
        />
      )}

      {viewingRegistrations && (
        <RegistrationsModal
          activity={viewingRegistrations}
          onClose={() => setViewingRegistrations(null)}
        />
      )}
    </>
  );
}

/* ───── Activity Create / Edit Modal ───── */

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
  const isEditing = !!activity;
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      title: form.title,
      content: form.content,
      activity_date: form.activity_date,
      activity_time: form.activity_time,
      location: form.location,
      capacity: parseInt(form.capacity),
      manager_name: form.manager_name,
      cancel_deadline: form.cancel_deadline,
    };

    if (isEditing) {
      const { error: updateError } = await supabase
        .from("activities")
        .update(payload)
        .eq("id", activity.id);

      if (updateError) {
        toast.error(`更新失敗：${updateError.message}`);
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

      const { error: insertError } = await supabase.from("activities").insert({
        ...payload,
        publisher_id: user.id,
        is_cancelled: false,
      });

      if (insertError) {
        toast.error(`建立失敗：${insertError.message}`);
        setIsSubmitting(false);
        return;
      }
    }

    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold">{isEditing ? "編輯活動" : "新增活動"}</h3>
          <button onClick={onClose} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">活動名稱</label>
            <input name="title" required value={form.title} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">活動內容</label>
            <textarea name="content" required rows={3} value={form.content} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">活動日期</label>
              <input name="activity_date" type="date" required value={form.activity_date} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">活動時間</label>
              <input name="activity_time" type="time" required value={form.activity_time} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">活動地點</label>
              <input name="location" required value={form.location} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">人數上限</label>
              <input name="capacity" type="number" min="1" required value={form.capacity} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">負責人</label>
              <input name="manager_name" required value={form.manager_name} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">最晚取消日</label>
              <input name="cancel_deadline" type="date" required value={form.cancel_deadline} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 rounded-lg font-semibold text-sm hover:bg-slate-50 transition-colors">
              取消
            </button>
            <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2">
              {isSubmitting && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
              {isEditing ? "儲存變更" : "建立活動"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───── Registrations Modal (with approve/reject) ───── */

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
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadRegistrations = useCallback(async () => {
    const { data } = await supabase
      .from("registrations")
      .select("id, volunteer_id, status, created_at, profiles:volunteer_id(full_name, email)")
      .eq("activity_id", activity.id)
      .order("created_at", { ascending: false });

    const mapped: RegistrationRow[] = (data || []).map((r: any) => ({
      id: r.id,
      volunteer_id: r.volunteer_id,
      status: r.status,
      created_at: r.created_at,
      volunteer_name: r.profiles?.full_name || "未知",
      volunteer_email: r.profiles?.email || "",
    }));

    setRegistrations(mapped);
    setIsLoading(false);
  }, [supabase, activity.id]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  useEffect(() => {
    if (actionMsg) {
      if (actionMsg.type === "success") {
        toast.success(actionMsg.text);
      } else {
        toast.error(actionMsg.text);
      }
      setActionMsg(null);
    }
  }, [actionMsg, toast]);

  const updateStatus = async (regId: string, newStatus: string, name: string) => {
    const label = newStatus === "approved" ? "通過" : "拒絕";
    const { error } = await supabase
      .from("registrations")
      .update({ status: newStatus })
      .eq("id", regId);

    if (error) {
      setActionMsg({ type: "error", text: `操作失敗：${error.message}` });
    } else {
      setActionMsg({ type: "success", text: `已${label}「${name}」的報名` });
      loadRegistrations();
    }
  };

  const statusCounts = registrations.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold">{activity.title}</h3>
            <p className="text-sm text-slate-500">
              {activity.activity_date} · {activity.location} · 上限 {activity.capacity} 人
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Stats bar */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-4 flex-wrap flex-shrink-0">
          <span className="text-sm text-slate-500">
            共 <span className="font-bold text-slate-700">{registrations.length}</span> 筆報名
          </span>
          {statusCounts.pending && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              待審核 {statusCounts.pending}
            </span>
          )}
          {statusCounts.approved && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              已通過 {statusCounts.approved}
            </span>
          )}
          {statusCounts.rejected && (
            <span className="flex items-center gap-1 text-xs font-semibold text-rose-600">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              未通過 {statusCounts.rejected}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            </div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-4xl block mb-2">inbox</span>
              目前沒有報名紀錄
            </div>
          ) : (
            <div className="space-y-3">
              {registrations.map((r) => {
                const s = REG_STATUS[r.status] || REG_STATUS.pending;
                const isPending = r.status === "pending";

                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm text-primary flex-shrink-0">
                      {r.volunteer_name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{r.volunteer_name}</p>
                      <p className="text-xs text-slate-500 truncate">{r.volunteer_email}</p>
                    </div>
                    <div className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(r.created_at).toLocaleDateString("zh-TW")}
                    </div>
                    <span className={`flex items-center gap-1.5 font-bold text-xs flex-shrink-0 ${s.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isPending ? (
                        <>
                          <button
                            onClick={() => updateStatus(r.id, "approved", r.volunteer_name)}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold rounded-lg transition-colors"
                          >
                            通過
                          </button>
                          <button
                            onClick={() => updateStatus(r.id, "rejected", r.volunteer_name)}
                            className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold rounded-lg transition-colors"
                          >
                            拒絕
                          </button>
                        </>
                      ) : r.status === "approved" ? (
                        <button
                          onClick={() => updateStatus(r.id, "rejected", r.volunteer_name)}
                          className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold rounded-lg transition-colors"
                        >
                          改為拒絕
                        </button>
                      ) : r.status === "rejected" ? (
                        <button
                          onClick={() => updateStatus(r.id, "approved", r.volunteer_name)}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold rounded-lg transition-colors"
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
  );
}
