"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminProfile } from "../admin-context";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminPanel,
} from "@/components/shells/admin-page-shell";

interface UserRow {
  id: string;
  account: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  region: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  system_admin: "系統管理員",
  unit_admin: "單位管理員",
  internal_staff: "內部人員",
  volunteer: "志工",
  guest: "訪客",
};

const ROLE_ORDER = ["system_admin", "unit_admin", "internal_staff", "volunteer", "guest"];

const STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: "啟用", dot: "bg-emerald-500", text: "text-emerald-700" },
  blacklisted: { label: "停權", dot: "bg-red-500", text: "text-red-700" },
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  system_admin: "bg-primary text-white",
  unit_admin: "bg-primary/10 text-primary",
  internal_staff: "bg-sky-100 text-sky-700",
  volunteer: "bg-slate-100 text-slate-700",
  guest: "bg-slate-100 text-slate-500",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
});

export default function AdminUsersPage() {
  const supabase = createClient();
  const toast = useToast();
  const adminProfile = useAdminProfile();
  const isSystemAdmin = adminProfile.role === "system_admin";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [confirmState, setConfirmState] = useState<{
    user: UserRow;
    newStatus: string;
    label: string;
    isDanger: boolean;
  } | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setUsers([]);
      toast.error(`使用者載入失敗：${error.message}`);
      setIsLoading(false);
      return;
    }

    setUsers((data as UserRow[]) || []);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleStatus = async (user: UserRow) => {
    if (user.id === adminProfile.id) {
      toast.error("不可停權目前登入的管理員帳號。");
      return;
    }

    const newStatus = user.status === "active" ? "blacklisted" : "active";
    const label = newStatus === "blacklisted" ? "停權" : "恢復";
    setConfirmState({
      user,
      newStatus,
      label,
      isDanger: newStatus === "blacklisted",
    });
  };

  const confirmToggleStatus = async () => {
    if (!confirmState) return;
    setIsTogglingStatus(true);

    const { user, newStatus, label } = confirmState;

    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", user.id);

    if (error) {
      toast.error(`操作失敗：${error.message}`);
    } else {
      toast.success(`已${label}「${user.full_name}」`);
      await loadUsers();
    }

    setIsTogglingStatus(false);
    setConfirmState(null);
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter !== "all" && u.status !== statusFilter) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.account.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.region || "").toLowerCase().includes(q)
    );
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const totalUsers = users.length;
  const newUsersThisMonth = users.filter((u) => new Date(u.created_at) >= monthStart).length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const managedUsers = users.filter((u) =>
    ["system_admin", "unit_admin", "internal_staff"].includes(u.role)
  ).length;
  const filtersApplied =
    searchQuery.trim().length > 0 || roleFilter !== "all" || statusFilter !== "all";

  const metricCards = [
    {
      label: "總使用者數",
      value: totalUsers.toLocaleString(),
      description: "平台帳號總量",
      icon: "groups",
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "本月新增",
      value: newUsersThisMonth.toLocaleString(),
      description: "本月完成註冊",
      icon: "person_add",
      accent: "bg-sky-100 text-sky-700",
    },
    {
      label: "啟用帳號",
      value: activeUsers.toLocaleString(),
      description: "目前可正常使用",
      icon: "verified_user",
      accent: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "管理帳號",
      value: managedUsers.toLocaleString(),
      description: "具後台存取權限",
      icon: "shield_person",
      accent: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="User Management"
        title="使用者管理"
        description="管理平台使用者帳號、角色與狀態。"
        right={
          <>
            <label className="relative block flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <span className="material-symbols-outlined text-[20px]">search</span>
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
                placeholder="搜尋姓名、帳號、Email、地區..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
              <span className="material-symbols-outlined text-[18px] text-primary">
                admin_panel_settings
              </span>
              {ROLE_LABELS[adminProfile.role] || adminProfile.role}
            </div>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <AdminMetricCard key={card.label} {...card} />
          ))}
        </div>

        <AdminPanel
          title="使用者列表"
          description="搜尋、篩選並管理平台使用者。"
          action={
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
              <span className="material-symbols-outlined text-[18px] text-slate-400">
                groups
              </span>
              顯示 {filtered.length} / {users.length} 位使用者
            </div>
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                <span className="material-symbols-outlined text-[18px] text-slate-400">
                  filter_list
                </span>
                <span>角色</span>
                <Select
                  className="w-auto min-w-[7.5rem]"
                  triggerClassName="min-h-0 border-none bg-transparent px-0 py-0 text-sm font-semibold text-slate-700 shadow-none focus:ring-0"
                  menuClassName="left-auto right-0 w-max min-w-full"
                  value={roleFilter}
                  ariaLabel="角色篩選"
                  onValueChange={setRoleFilter}
                  options={[
                    { value: "all", label: "全部" },
                    ...ROLE_ORDER.map((role) => ({
                      value: role,
                      label: ROLE_LABELS[role],
                    })),
                  ]}
                />
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                <span className="material-symbols-outlined text-[18px] text-slate-400">
                  check_circle
                </span>
                <span>狀態</span>
                <Select
                  className="w-auto min-w-[6rem]"
                  triggerClassName="min-h-0 border-none bg-transparent px-0 py-0 text-sm font-semibold text-slate-700 shadow-none focus:ring-0"
                  menuClassName="left-auto right-0 w-max min-w-full"
                  value={statusFilter}
                  ariaLabel="狀態篩選"
                  onValueChange={setStatusFilter}
                  options={[
                    { value: "all", label: "全部" },
                    { value: "active", label: "啟用" },
                    { value: "blacklisted", label: "停權" },
                  ]}
                />
              </div>

              {filtersApplied && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setRoleFilter("all");
                    setStatusFilter("all");
                  }}
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-primary"
                >
                  清除篩選
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                progress_activity
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      使用者
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Email
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      角色
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      註冊日期
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      狀態
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length > 0 ? (
                    filtered.map((u) => {
                      const initials = u.full_name.slice(0, 2).toUpperCase();
                      const st = STATUS_STYLES[u.status] || STATUS_STYLES.active;
                      const isCurrentAdmin = u.id === adminProfile.id;

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-xs text-primary">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/admin/users/${u.id}`}
                                  className="block truncate text-sm font-semibold text-slate-900 transition-colors hover:text-primary"
                                >
                                  {u.full_name}
                                </Link>
                                <p className="truncate text-xs text-slate-500">
                                  帳號：{u.account}
                                </p>
                                <p className="truncate text-[11px] text-slate-400">
                                  {u.region || "未填寫地區"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                ROLE_BADGE_STYLES[u.role] || "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {ROLE_LABELS[u.role] || u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {DATE_FORMATTER.format(new Date(u.created_at))}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                              <span className={`text-sm font-medium ${st.text}`}>
                                {st.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={`/admin/users/${u.id}`}
                                className="p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary rounded-lg"
                                title="查看檔案"
                              >
                                <span className="material-symbols-outlined text-[20px]">
                                  contact_page
                                </span>
                              </Link>
                              {isSystemAdmin && (
                                <>
                                  <button
                                    onClick={() => {
                                      if (isCurrentAdmin) {
                                        toast.error("不可修改自己目前的管理員角色。");
                                        return;
                                      }
                                      setEditingUser(u);
                                    }}
                                    className={`p-1.5 transition-colors ${
                                      isCurrentAdmin
                                        ? "cursor-not-allowed text-slate-300"
                                        : "text-slate-400 hover:text-primary"
                                    }`}
                                    disabled={isCurrentAdmin}
                                    title={isCurrentAdmin ? "不可修改自己的角色" : "設定角色"}
                                  >
                                    <span className="material-symbols-outlined text-[20px]">
                                      manage_accounts
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => handleToggleStatus(u)}
                                    className={`p-1.5 transition-colors ${
                                      isCurrentAdmin
                                        ? "cursor-not-allowed text-slate-300"
                                        : u.status === "active"
                                          ? "text-slate-400 hover:text-red-500"
                                          : "text-red-400 hover:text-emerald-500"
                                    }`}
                                    disabled={isCurrentAdmin}
                                    title={
                                      isCurrentAdmin
                                        ? "不可停權自己的帳號"
                                        : u.status === "active"
                                          ? "停權"
                                          : "恢復"
                                    }
                                  >
                                    <span className="material-symbols-outlined text-[20px]">
                                      {u.status === "active" ? "block" : "check_circle"}
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
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-2 block">search_off</span>
                        {users.length === 0 ? "目前沒有使用者" : "找不到符合條件的使用者"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  顯示 <span className="font-semibold text-slate-700">{filtered.length}</span> 位使用者
                </p>
                <p>
                  全部共 <span className="font-semibold text-slate-700">{users.length}</span> 位
                </p>
              </div>
            </div>
          )}
        </AdminPanel>
      </div>

      {/* Role Edit Modal */}
      {editingUser && (
        <RoleEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
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
        title={confirmState ? `確定要${confirmState.label}「${confirmState.user.full_name}」嗎？` : ""}
        description={
          confirmState?.isDanger
            ? "停權後，該帳號將無法正常使用平台功能。"
            : "恢復後，該帳號將可正常使用平台功能。"
        }
        confirmText={confirmState?.label || "確定"}
        cancelText="取消"
        isConfirmDanger={!!confirmState?.isDanger}
        isLoading={isTogglingStatus}
        onClose={() => {
          if (isTogglingStatus) return;
          setConfirmState(null);
        }}
        onConfirm={confirmToggleStatus}
      />
    </>
  );
}

function RoleEditModal({
  user,
  onClose,
  onSaved,
  onMsg,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
  onMsg: (msg: { type: "success" | "error"; text: string }) => void;
}) {
  const supabase = createClient();
  const [selectedRole, setSelectedRole] = useState(user.role);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (selectedRole === user.role) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role: selectedRole })
      .eq("id", user.id);

    if (error) {
      onMsg({ type: "error", text: `角色更新失敗：${error.message}` });
    } else {
      onMsg({ type: "success", text: `已將「${user.full_name}」的角色設為「${ROLE_LABELS[selectedRole]}」` });
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
          <h3 className="text-lg font-bold">設定使用者角色</h3>
          <button onClick={onClose} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-sm text-primary">
              {user.full_name.slice(0, 2)}
            </div>
            <div>
              <p className="font-semibold">{user.full_name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">角色</label>
            <div className="space-y-2">
              {ROLE_ORDER.map((r) => (
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
                    <p className="text-sm font-medium">{ROLE_LABELS[r]}</p>
                    <p className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[r]}</p>
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
              disabled={isSubmitting || selectedRole === user.role}
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

const ROLE_DESCRIPTIONS: Record<string, string> = {
  system_admin: "最高權限，可管理所有系統設定及使用者角色",
  unit_admin: "單位層級管理，可管理活動及查看報名",
  internal_staff: "內部人員，可存取後台管理介面",
  volunteer: "一般志工帳號，可報名活動",
  guest: "訪客帳號，僅能瀏覽公開資訊",
};
