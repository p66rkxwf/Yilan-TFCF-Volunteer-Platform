"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminProfile } from "../admin-context";
import { useToast } from "@/components/ui/toast";

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

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  active: { label: "啟用", cls: "bg-emerald-100 text-emerald-700" },
  blacklisted: { label: "停權", cls: "bg-red-100 text-red-700" },
};

export default function AdminUsersPage() {
  const supabase = createClient();
  const toast = useToast();
  const adminProfile = useAdminProfile();
  const isSystemAdmin = adminProfile.role === "system_admin";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadUsers = useCallback(async () => {
    let query = supabase.from("profiles").select("*");
    if (roleFilter !== "all") query = query.eq("role", roleFilter);
    const { data } = await query.order("created_at", { ascending: false });
    setUsers((data as UserRow[]) || []);
    setIsLoading(false);
  }, [supabase, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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

  const handleToggleStatus = async (user: UserRow) => {
    if (user.id === adminProfile.id) {
      setActionMsg({ type: "error", text: "不可停權目前登入的管理員帳號。" });
      return;
    }

    const newStatus = user.status === "active" ? "blacklisted" : "active";
    const label = newStatus === "blacklisted" ? "停權" : "恢復";
    if (!confirm(`確定要${label}「${user.full_name}」嗎？`)) return;

    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", user.id);

    if (error) {
      setActionMsg({ type: "error", text: `操作失敗：${error.message}` });
    } else {
      setActionMsg({ type: "success", text: `已${label}「${user.full_name}」` });
      loadUsers();
    }
  };

  const filtered = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.account.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <header className="bg-white border-b border-slate-200 p-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold">使用者管理</h2>
          <p className="text-sm text-slate-500">
            管理平台使用者帳號及權限。
            {isSystemAdmin && (
              <span className="ml-2 text-primary font-medium">（系統管理員：可調整角色與停權）</span>
            )}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Search & Filters */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                search
              </span>
              <input
                className="w-full pl-10 pr-4 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/50 text-sm"
                placeholder="搜尋姓名、帳號、Email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <select
            className="bg-background-light border-none rounded-lg text-sm px-4 py-2 focus:ring-2 focus:ring-primary/50"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setIsLoading(true);
            }}
          >
            <option value="all">全部角色</option>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">使用者</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">帳號</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">角色</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">地區</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">狀態</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">註冊日期</th>
                    {isSystemAdmin && (
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">操作</th>
                    )}
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
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-primary">
                                {initials}
                              </div>
                              <div>
                                <p className="font-semibold">{u.full_name}</p>
                                <p className="text-xs text-slate-500">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{u.account}</td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                              {ROLE_LABELS[u.role] || u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{u.region || "—"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(u.created_at).toLocaleDateString("zh-TW")}
                          </td>
                          {isSystemAdmin && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    if (isCurrentAdmin) {
                                      setActionMsg({ type: "error", text: "不可修改自己目前的管理員角色。" });
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
                                  <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
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
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={isSystemAdmin ? 7 : 6} className="px-6 py-16 text-center text-slate-400">
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
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <p className="text-sm text-slate-500">共 {filtered.length} 位使用者</p>
            </div>
          )}
        </div>
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
          onMsg={setActionMsg}
        />
      )}
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
