"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminProfile } from "../admin-context";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setStaffStatus, setStaffRole } from "@/lib/actions/admin-users";
import type { StaffRole } from "@/lib/types/database";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminPanel,
} from "@/components/shells/admin-page-shell";

interface VolunteerRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  region: string | null;
  grade: string;
  created_at: string;
  last_login_at: string | null;
}

interface StaffRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  role: StaffRole;
  job_title: string;
  status: string;
  region: string | null;
  created_at: string;
  last_login_at: string | null;
}

const STAFF_ROLE_LABELS: Record<string, string> = {
  system_admin: "系統管理員",
  unit_admin: "單位管理員",
  staff: "一般職員",
};
const STAFF_ROLE_ORDER: StaffRole[] = ["system_admin", "unit_admin", "staff"];
const STAFF_ROLE_BADGE: Record<string, string> = {
  system_admin: "bg-primary text-white",
  unit_admin: "bg-primary/10 text-primary",
  staff: "bg-sky-100 text-sky-700",
};
const STAFF_ROLE_DESCRIPTIONS: Record<string, string> = {
  system_admin: "最高權限，可管理所有系統設定及使用者角色",
  unit_admin: "單位層級管理，可審核志工帳號、管理活動",
  staff: "一般職員，可存取後台管理介面",
};

const VOLUNTEER_STATUS_LABELS: Record<string, string> = {
  pending_review: "待審核",
  active: "在職",
  suspended: "停權",
  graduated: "已畢業結案",
  rejected: "審核未通過",
};
const VOLUNTEER_STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  pending_review: { dot: "bg-amber-500", text: "text-amber-700" },
  active: { dot: "bg-emerald-500", text: "text-emerald-700" },
  suspended: { dot: "bg-red-500", text: "text-red-700" },
  graduated: { dot: "bg-slate-400", text: "text-slate-600" },
  rejected: { dot: "bg-rose-500", text: "text-rose-700" },
};

const STAFF_STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: "啟用", dot: "bg-emerald-500", text: "text-emerald-700" },
  suspended: { label: "停權", dot: "bg-red-500", text: "text-red-700" },
};

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

export default function AdminUsersPage() {
  const supabase = createClient();
  const toast = useToast();
  const adminProfile = useAdminProfile();
  const isSystemAdmin = adminProfile.role === "system_admin";

  const [tab, setTab] = useState<"volunteer" | "staff">("volunteer");
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [pendingDeactivationIds, setPendingDeactivationIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [volunteerStatusFilter, setVolunteerStatusFilter] = useState("all");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [editingStaff, setEditingStaff] = useState<StaffRow | null>(null);
  const [confirmState, setConfirmState] = useState<{
    staff: StaffRow;
    newStatus: "active" | "suspended";
    label: string;
    isDanger: boolean;
  } | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    const [
      { data: volunteerData, error: volunteerError },
      { data: staffData, error: staffError },
      { data: pendingDeactivations },
    ] = await Promise.all([
      supabase.from("volunteer_profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("staff_profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("deactivation_requests").select("volunteer_id").eq("status", "pending"),
    ]);

    if (volunteerError || staffError) {
      toast.error(`使用者載入失敗：${(volunteerError || staffError)?.message}`);
    }

    setVolunteers((volunteerData as VolunteerRow[]) || []);
    setStaffList((staffData as StaffRow[]) || []);
    setPendingDeactivationIds(new Set((pendingDeactivations || []).map((r) => r.volunteer_id)));
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleStaffStatus = (staff: StaffRow) => {
    if (staff.id === adminProfile.id) {
      toast.error("不可停權目前登入的管理員帳號。");
      return;
    }
    const newStatus = staff.status === "active" ? "suspended" : "active";
    setConfirmState({
      staff,
      newStatus,
      label: newStatus === "suspended" ? "停權" : "恢復",
      isDanger: newStatus === "suspended",
    });
  };

  const confirmToggleStaffStatus = async () => {
    if (!confirmState) return;
    setIsTogglingStatus(true);

    const { staff, newStatus, label } = confirmState;
    const { error } = await setStaffStatus(staff.id, newStatus);

    if (error) {
      toast.error(`操作失敗：${error}`);
    } else {
      toast.success(`已${label}「${staff.full_name}」`);
      await loadUsers();
    }

    setIsTogglingStatus(false);
    setConfirmState(null);
  };

  const filteredVolunteers = volunteers.filter((v) => {
    if (volunteerStatusFilter !== "all" && v.status !== volunteerStatusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.full_name.toLowerCase().includes(q) ||
      v.username.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q) ||
      (v.region || "").toLowerCase().includes(q)
    );
  });

  const filteredStaff = staffList.filter((s) => {
    if (staffRoleFilter !== "all" && s.role !== staffRoleFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const totalUsers = volunteers.length + staffList.length;
  const pendingReviewCount = volunteers.filter((v) => v.status === "pending_review").length;
  const newUsersThisMonth =
    volunteers.filter((v) => new Date(v.created_at) >= monthStart).length +
    staffList.filter((s) => new Date(s.created_at) >= monthStart).length;

  const metricCards = [
    {
      label: "總使用者數",
      value: totalUsers.toLocaleString(),
      description: "職員 + 志工帳號總量",
      icon: "groups",
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "待審核志工",
      value: pendingReviewCount.toLocaleString(),
      description: "需要審核才能報名",
      icon: "pending_actions",
      accent: pendingReviewCount > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
    },
    {
      label: "本月新增",
      value: newUsersThisMonth.toLocaleString(),
      description: "本月完成註冊/建立",
      icon: "person_add",
      accent: "bg-sky-100 text-sky-700",
    },
    {
      label: "職員帳號",
      value: staffList.length.toLocaleString(),
      description: "具後台存取權限",
      icon: "shield_person",
      accent: "bg-emerald-100 text-emerald-700",
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="User Management"
        title="使用者管理"
        description="管理志工帳號審核與職員角色權限。"
        right={
          <label className="relative block flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
              placeholder="搜尋姓名、帳號、Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <AdminMetricCard key={card.label} {...card} />
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTab("volunteer")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "volunteer" ? "bg-primary text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            志工（{volunteers.length}）
          </button>
          <button
            onClick={() => setTab("staff")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "staff" ? "bg-primary text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            職員（{staffList.length}）
          </button>
        </div>

        {tab === "volunteer" ? (
          <AdminPanel
            title="志工列表"
            description="搜尋、篩選並審核志工帳號。"
            action={
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
                顯示 {filteredVolunteers.length} / {volunteers.length} 位志工
              </div>
            }
            bodyClassName="p-0"
          >
            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                <span className="material-symbols-outlined text-[18px] text-slate-400">filter_list</span>
                <span>狀態</span>
                <Select
                  className="w-auto min-w-[7.5rem]"
                  triggerClassName="min-h-0 border-none bg-transparent px-0 py-0 text-sm font-semibold text-slate-700 shadow-none focus:ring-0"
                  menuClassName="left-auto right-0 w-max min-w-full"
                  value={volunteerStatusFilter}
                  ariaLabel="志工狀態篩選"
                  onValueChange={setVolunteerStatusFilter}
                  options={[
                    { value: "all", label: "全部" },
                    ...Object.entries(VOLUNTEER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
                  ]}
                />
              </div>
            </div>

            {isLoading ? (
              <LoadingRow />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <Th>志工</Th>
                      <Th>Email / 電話</Th>
                      <Th>狀態</Th>
                      <Th>註冊日期</Th>
                      <Th>最後登入</Th>
                      <Th className="text-right">操作</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVolunteers.length > 0 ? (
                      filteredVolunteers.map((v) => {
                        const st = VOLUNTEER_STATUS_STYLES[v.status] || VOLUNTEER_STATUS_STYLES.active;
                        return (
                          <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-xs text-primary">
                                  {v.full_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <Link
                                    href={`/admin/users/${v.id}`}
                                    className="block truncate text-sm font-semibold text-slate-900 transition-colors hover:text-primary"
                                  >
                                    {v.full_name}
                                  </Link>
                                  <p className="truncate text-xs text-slate-500">帳號：{v.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              <p>{v.email}</p>
                              <p className="text-xs text-slate-400">{v.phone}</p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                                <span className={`text-sm font-medium ${st.text}`}>
                                  {VOLUNTEER_STATUS_LABELS[v.status] || v.status}
                                </span>
                                {pendingDeactivationIds.has(v.id) && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                    停用申請
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {DATE_FORMATTER.format(new Date(v.created_at))}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {v.last_login_at ? DATE_TIME_FORMATTER.format(new Date(v.last_login_at)) : "尚未登入"}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Link
                                href={`/admin/users/${v.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                              >
                                {v.status === "pending_review" ? "前往審核" : "查看檔案"}
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <EmptyRow colSpan={6} empty={volunteers.length === 0} />
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        ) : (
          <AdminPanel
            title="職員列表"
            description="管理職員角色與帳號狀態。"
            action={
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
                顯示 {filteredStaff.length} / {staffList.length} 位職員
              </div>
            }
            bodyClassName="p-0"
          >
            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                <span className="material-symbols-outlined text-[18px] text-slate-400">filter_list</span>
                <span>角色</span>
                <Select
                  className="w-auto min-w-[7.5rem]"
                  triggerClassName="min-h-0 border-none bg-transparent px-0 py-0 text-sm font-semibold text-slate-700 shadow-none focus:ring-0"
                  menuClassName="left-auto right-0 w-max min-w-full"
                  value={staffRoleFilter}
                  ariaLabel="角色篩選"
                  onValueChange={setStaffRoleFilter}
                  options={[
                    { value: "all", label: "全部" },
                    ...STAFF_ROLE_ORDER.map((role) => ({ value: role, label: STAFF_ROLE_LABELS[role] })),
                  ]}
                />
              </div>
            </div>

            {isLoading ? (
              <LoadingRow />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <Th>職員</Th>
                      <Th>Email / 電話</Th>
                      <Th>角色</Th>
                      <Th>狀態</Th>
                      <Th>註冊日期</Th>
                      <Th className="text-right">操作</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStaff.length > 0 ? (
                      filteredStaff.map((s) => {
                        const st = STAFF_STATUS_STYLES[s.status] || STAFF_STATUS_STYLES.active;
                        const isCurrentAdmin = s.id === adminProfile.id;
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-xs text-primary">
                                  {s.full_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <Link
                                    href={`/admin/users/${s.id}`}
                                    className="block truncate text-sm font-semibold text-slate-900 transition-colors hover:text-primary"
                                  >
                                    {s.full_name}
                                  </Link>
                                  <p className="truncate text-xs text-slate-500">帳號：{s.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              <p>{s.email}</p>
                              <p className="text-xs text-slate-400">{s.phone}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STAFF_ROLE_BADGE[s.role] || "bg-slate-100 text-slate-700"}`}>
                                {STAFF_ROLE_LABELS[s.role] || s.role}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                                <span className={`text-sm font-medium ${st.text}`}>{st.label}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {DATE_FORMATTER.format(new Date(s.created_at))}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Link
                                  href={`/admin/users/${s.id}`}
                                  className="p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary rounded-lg"
                                  title="查看檔案"
                                >
                                  <span className="material-symbols-outlined text-[20px]">contact_page</span>
                                </Link>
                                {isSystemAdmin && (
                                  <>
                                    <button
                                      onClick={() => {
                                        if (isCurrentAdmin) {
                                          toast.error("不可修改自己目前的角色。");
                                          return;
                                        }
                                        setEditingStaff(s);
                                      }}
                                      className={`p-1.5 transition-colors ${
                                        isCurrentAdmin ? "cursor-not-allowed text-slate-300" : "text-slate-400 hover:text-primary"
                                      }`}
                                      disabled={isCurrentAdmin}
                                      title={isCurrentAdmin ? "不可修改自己的角色" : "設定角色"}
                                    >
                                      <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
                                    </button>
                                    <button
                                      onClick={() => handleToggleStaffStatus(s)}
                                      className={`p-1.5 transition-colors ${
                                        isCurrentAdmin
                                          ? "cursor-not-allowed text-slate-300"
                                          : s.status === "active"
                                            ? "text-slate-400 hover:text-red-500"
                                            : "text-red-400 hover:text-emerald-500"
                                      }`}
                                      disabled={isCurrentAdmin}
                                      title={isCurrentAdmin ? "不可停權自己的帳號" : s.status === "active" ? "停權" : "恢復"}
                                    >
                                      <span className="material-symbols-outlined text-[20px]">
                                        {s.status === "active" ? "block" : "check_circle"}
                                      </span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <EmptyRow colSpan={6} empty={staffList.length === 0} />
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        )}
      </div>

      {editingStaff && (
        <RoleEditModal
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSaved={() => {
            setEditingStaff(null);
            loadUsers();
          }}
          onMsg={(msg) => {
            if (msg.type === "success") toast.success(msg.text);
            else toast.error(msg.text);
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState ? `確定要${confirmState.label}「${confirmState.staff.full_name}」嗎？` : ""}
        description={
          confirmState?.isDanger
            ? "停權後，該職員將無法登入後台。"
            : "恢復後，該職員將可正常登入後台。"
        }
        confirmText={confirmState?.label || "確定"}
        cancelText="取消"
        isConfirmDanger={!!confirmState?.isDanger}
        isLoading={isTogglingStatus}
        onClose={() => {
          if (isTogglingStatus) return;
          setConfirmState(null);
        }}
        onConfirm={confirmToggleStaffStatus}
      />
    </>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
    </div>
  );
}

function EmptyRow({ colSpan, empty }: { colSpan: number; empty: boolean }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-16 text-center text-slate-400">
        <span className="material-symbols-outlined text-4xl mb-2 block">search_off</span>
        {empty ? "目前沒有資料" : "找不到符合條件的使用者"}
      </td>
    </tr>
  );
}

function RoleEditModal({
  staff,
  onClose,
  onSaved,
  onMsg,
}: {
  staff: StaffRow;
  onClose: () => void;
  onSaved: () => void;
  onMsg: (msg: { type: "success" | "error"; text: string }) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<StaffRole>(staff.role);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (selectedRole === staff.role) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    const { error } = await setStaffRole(staff.id, selectedRole);

    if (error) {
      onMsg({ type: "error", text: `角色更新失敗：${error}` });
    } else {
      onMsg({ type: "success", text: `已將「${staff.full_name}」的角色設為「${STAFF_ROLE_LABELS[selectedRole]}」` });
      onSaved();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-8">
      <div
        className="relative z-10 w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold">設定職員角色</h3>
          <button onClick={onClose} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-sm text-primary">
              {staff.full_name.slice(0, 2)}
            </div>
            <div>
              <p className="font-semibold">{staff.full_name}</p>
              <p className="text-xs text-slate-500">{staff.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">角色</label>
            <div className="space-y-2">
              {STAFF_ROLE_ORDER.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedRole === r
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={selectedRole === r}
                    onChange={() => setSelectedRole(r)}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{STAFF_ROLE_LABELS[r]}</p>
                    <p className="text-xs text-slate-500">{STAFF_ROLE_DESCRIPTIONS[r]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-200 rounded-lg font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting || selectedRole === staff.role}
              className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {isSubmitting && (
                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              )}
              儲存
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
