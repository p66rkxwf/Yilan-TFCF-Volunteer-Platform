"use client";

// 職員管理：名冊、角色指派、停權／復職（皆限系統管理員；DB trigger 亦強制，
// 並保護最後一位系統管理員不可被停權或降級）。建立帳號走獨立頁面。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../admin-context";
import {
  setStaffRole,
  setStaffStatus,
  reassignWorker,
  resetStaffPassword,
} from "@/lib/actions/admin-users";
import { updateStaffProfile } from "@/lib/actions/staff-profile";
import {
  archiveRecord,
  restoreRecord,
  deleteRecordPermanently,
} from "@/lib/actions/admin-archive";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  Toolbar,
  SearchInput,
  Field,
  RowActionMenu,
  inputClass,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { STAFF_ROLE, STAFF_JOB_TITLE, STAFF_STATUS } from "@/lib/admin/labels";
import { isValidEmail, isValidTaiwanPhone, isValidUsername } from "@/lib/validation";
import { YILAN_REGIONS } from "@/lib/types/database";
import type { StaffRole, StaffJobTitle, StaffAccountStatus } from "@/lib/types/database";

interface StaffRow {
  id: string;
  full_name: string;
  username: string;
  email: string;
  phone: string;
  region: string | null;
  role: StaffRole;
  job_title: StaffJobTitle;
  status: StaffAccountStatus;
}

export default function StaffPage() {
  const supabase = createClient();
  const toast = useToast();
  const profile = useAdminProfile();
  const isSystemAdmin = profile.role === "system_admin";
  // 改派學生限單位管理員以上（與「審核時指派社工」同權限；RPC 亦強制）。
  const isAdmin = profile.role === "system_admin" || profile.role === "unit_admin";

  const [rows, setRows] = useState<StaffRow[]>([]);
  // 各社工目前指派的學生數（assigned_worker_id 計數）。
  const [workerCounts, setWorkerCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusConfirm, setStatusConfirm] = useState<StaffRow | null>(null);
  const [resetPwTarget, setResetPwTarget] = useState<StaffRow | null>(null);
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    region: "",
    email: "",
    username: "",
    jobTitle: "social_worker" as StaffJobTitle,
  });
  const [editErrors, setEditErrors] = useState<{
    fullName?: string;
    phone?: string;
    email?: string;
    username?: string;
  }>({});
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<StaffRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  // 角色變更改為二次確認後生效（原為下拉選了立即生效）
  const [roleConfirm, setRoleConfirm] = useState<{ row: StaffRow; role: StaffRole } | null>(null);
  const [isActing, setIsActing] = useState(false);

  // 學生移轉對話框
  const [reassignFrom, setReassignFrom] = useState<StaffRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    let staffQuery = supabase
      .from("staff_profiles")
      .select("id, full_name, username, email, phone, region, role, job_title, status")
      .order("created_at", { ascending: true });
    staffQuery = showArchived
      ? staffQuery.not("deleted_at", "is", null)
      : staffQuery.is("deleted_at", null);
    const [staffRes, assignedRes] = await Promise.all([
      staffQuery,
      supabase
        .from("volunteer_profiles")
        .select("assigned_worker_id")
        .is("deleted_at", null)
        .not("assigned_worker_id", "is", null),
    ]);
    if (staffRes.error) toast.error(`載入職員失敗：${staffRes.error.message}`);
    else setRows((staffRes.data ?? []) as StaffRow[]);

    const counts: Record<string, number> = {};
    for (const r of (assignedRes.data ?? []) as { assigned_worker_id: string }[]) {
      counts[r.assigned_worker_id] = (counts[r.assigned_worker_id] ?? 0) + 1;
    }
    setWorkerCounts(counts);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter(
      (r) => r.full_name.includes(q) || r.username.includes(q) || r.phone.includes(q)
    );
  }, [rows, search]);

  const confirmRoleChange = async () => {
    if (!roleConfirm) return;
    setIsActing(true);
    const result = await setStaffRole(roleConfirm.row.id, roleConfirm.role);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success(
      `已將 ${roleConfirm.row.full_name} 的角色設為${STAFF_ROLE[roleConfirm.role]}`
    );
    setRoleConfirm(null);
    await load();
  };

  // 移轉目標：在職社工，排除來源本人
  const reassignTargets = useMemo(() => {
    if (!reassignFrom) return [];
    return rows.filter(
      (r) =>
        r.job_title === "social_worker" &&
        r.status === "active" &&
        r.id !== reassignFrom.id
    );
  }, [rows, reassignFrom]);

  const openReassign = (row: StaffRow) => {
    setReassignFrom(row);
    setReassignTo("");
  };

  const handleReassign = async () => {
    if (!reassignFrom || !reassignTo) return;
    setIsActing(true);
    const result = await reassignWorker(reassignFrom.id, reassignTo);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    const toName = rows.find((r) => r.id === reassignTo)?.full_name ?? "新社工";
    toast.success(
      `已將 ${reassignFrom.full_name} 名下 ${result.movedCount ?? 0} 位學生移轉給 ${toName}`
    );
    setReassignFrom(null);
    setReassignTo("");
    await load();
  };

  const confirmStatus = async () => {
    if (!statusConfirm) return;
    setIsActing(true);
    const next = statusConfirm.status === "active" ? "suspended" : "active";
    const result = await setStaffStatus(statusConfirm.id, next);
    setIsActing(false);
    if (result.error && !result.success) return void toast.error(result.error);
    if (result.error) toast.info(result.error);
    else toast.success(next === "suspended" ? "已停權" : "已復職");
    setStatusConfirm(null);
    await load();
  };

  const confirmResetPw = async () => {
    if (!resetPwTarget) return;
    setIsActing(true);
    const result = await resetStaffPassword(resetPwTarget.id);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success(
      `已將密碼重置為帳號「${result.username}」，該職員首次登入時需自行設定新密碼。`
    );
    setResetPwTarget(null);
  };

  const openEdit = (row: StaffRow) => {
    setEditForm({
      fullName: row.full_name,
      phone: row.phone,
      region: row.region ?? "",
      email: row.email,
      username: row.username,
      jobTitle: row.job_title,
    });
    setEditErrors({});
    setEditTarget(row);
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setIsActing(true);
    const result = await archiveRecord("staff_profiles", archiveTarget.id);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success("已封存並停用該職員帳號登入");
    setArchiveTarget(null);
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsActing(true);
    const result = await deleteRecordPermanently("staff_profiles", deleteTarget.id);
    setIsActing(false);
    if (result.error && !result.success) return void toast.error(result.error);
    if (result.error) toast.info(result.error);
    else toast.success(`已永久刪除 ${deleteTarget.full_name} 的帳號`);
    setDeleteTarget(null);
    await load();
  };

  const restoreStaff = async (row: StaffRow) => {
    const result = await restoreRecord("staff_profiles", row.id);
    if (result.error) return void toast.error(result.error);
    toast.success("已還原並恢復登入");
    await load();
  };

  // 職員姓名/職稱已鎖定自助修改；系統管理員在此代為維護（改走 server action＋RPC，
  // 全程稽核；Email 為登入信箱，action 內會同步 auth.users）。
  const submitEdit = async () => {
    if (!editTarget) return;
    const errors: typeof editErrors = {};
    if (!editForm.fullName.trim()) errors.fullName = "請輸入姓名";
    if (!editForm.phone.trim()) errors.phone = "請輸入聯絡電話";
    else if (!isValidTaiwanPhone(editForm.phone)) errors.phone = "電話格式不正確（例：0912345678 或 03-1234567）";
    if (!isValidEmail(editForm.email)) errors.email = "Email 格式不正確";
    if (!isValidUsername(editForm.username)) errors.username = "帳號格式不正確（4～30 碼英數與 . _ -）";
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setIsActing(true);
    const result = await updateStaffProfile({
      staffId: editTarget.id,
      fullName: editForm.fullName.trim(),
      phone: editForm.phone.trim(),
      region: editForm.region.trim() || undefined,
      email: editForm.email.trim(),
      username: editForm.username.trim(),
      jobTitle: editForm.jobTitle,
    });
    setIsActing(false);
    if (result.error) return void toast.error(`更新失敗：${result.error}`);
    const usernameChanged = editForm.username.trim() !== editTarget.username;
    toast.success("已更新職員基本資料");
    if (usernameChanged) {
      toast.info(`該職員下次登入請改用新帳號「${editForm.username.trim()}」。`);
    }
    setEditTarget(null);
    await load();
  };

  return (
    <>
      <PageHeader
        title="職員管理"
        actions={
          isSystemAdmin ? (
            <>
              <Link
                href="/admin/staff/bulk"
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-zinc-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-zinc-100"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                批量匯入
              </Link>
              <Link
                href="/admin/staff/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                新增職員
              </Link>
            </>
          ) : undefined
        }
      />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        {!isSystemAdmin && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            角色指派、停權與建立帳號僅限系統管理員；學生移轉限單位管理員以上。
          </div>
        )}
        <Panel padded={false} fill>
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜尋姓名、帳號或電話…"
              className="w-56"
            />
            {isSystemAdmin && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/30"
                />
                顯示已封存
              </label>
            )}
            <p className="ml-auto text-xs text-slate-400">共 {filtered.length} 人</p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <Th>姓名</Th>
                <Th>帳號</Th>
                <Th>電話</Th>
                <Th>職稱</Th>
                <Th>負責學生</Th>
                <Th>角色</Th>
                <Th>狀態</Th>
                {isAdmin && <Th className="text-right">操作</Th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={isAdmin ? 8 : 7} />
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={isAdmin ? 8 : 7} message="沒有符合的職員" />
              ) : (
                filtered.map((row) => {
                  const isSelf = row.id === profile.id;
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <Td className="font-semibold text-slate-900">
                        {row.full_name}
                        {isSelf && <span className="ml-1 text-xs text-slate-400">（我）</span>}
                      </Td>
                      <Td className="text-slate-500">
                        {row.username}
                        <p className="text-xs text-slate-400">{row.email}</p>
                      </Td>
                      <Td className="text-slate-500">{row.phone}</Td>
                      <Td className="whitespace-nowrap">{STAFF_JOB_TITLE[row.job_title]}</Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {row.job_title === "social_worker"
                          ? `${workerCounts[row.id] ?? 0} 位`
                          : "—"}
                      </Td>
                      <Td className="w-36">
                        {isSystemAdmin && !isSelf && !showArchived ? (
                          <Select
                            value={row.role}
                            onValueChange={(v) => {
                              if (v !== row.role) setRoleConfirm({ row, role: v as StaffRole });
                            }}
                            options={Object.entries(STAFF_ROLE).map(([value, label]) => ({
                              value,
                              label,
                            }))}
                            triggerClassName="py-1.5 text-xs"
                          />
                        ) : (
                          STAFF_ROLE[row.role]
                        )}
                      </Td>
                      <Td>
                        <StatusPill meta={STAFF_STATUS[row.status]} />
                      </Td>
                      {isAdmin && (
                        <Td className="text-right">
                          <RowActionMenu
                            ariaLabel={`${row.full_name} 的操作`}
                            actions={
                              showArchived
                                ? [
                                    isSystemAdmin && {
                                      label: "還原",
                                      icon: "restore",
                                      onSelect: () => restoreStaff(row),
                                    },
                                    isSystemAdmin &&
                                      !isSelf && {
                                        label: "永久刪除",
                                        icon: "delete_forever",
                                        danger: true,
                                        onSelect: () => setDeleteTarget(row),
                                      },
                                  ]
                                : [
                                    row.job_title === "social_worker" &&
                                      (workerCounts[row.id] ?? 0) > 0 && {
                                        label: "移轉學生",
                                        icon: "swap_horiz",
                                        onSelect: () => openReassign(row),
                                      },
                                    isSystemAdmin && {
                                      label: "編輯",
                                      icon: "edit",
                                      onSelect: () => openEdit(row),
                                    },
                                    isSystemAdmin &&
                                      !isSelf && {
                                        label: "重置密碼",
                                        icon: "lock_reset",
                                        onSelect: () => setResetPwTarget(row),
                                      },
                                    isSystemAdmin &&
                                      !isSelf && {
                                        label: row.status === "active" ? "停權" : "復職",
                                        icon:
                                          row.status === "active" ? "person_off" : "person_check",
                                        onSelect: () => setStatusConfirm(row),
                                      },
                                    isSystemAdmin &&
                                      !isSelf &&
                                      (workerCounts[row.id] ?? 0) === 0 && {
                                        label: "封存",
                                        icon: "archive",
                                        onSelect: () => setArchiveTarget(row),
                                      },
                                    isSystemAdmin &&
                                      !isSelf && {
                                        label: "永久刪除",
                                        icon: "delete_forever",
                                        danger: true,
                                        onSelect: () => setDeleteTarget(row),
                                      },
                                  ]
                            }
                          />
                        </Td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <ConfirmDialog
        open={statusConfirm !== null}
        title={
          statusConfirm?.status === "active"
            ? `停權 ${statusConfirm?.full_name}？`
            : `復職 ${statusConfirm?.full_name}？`
        }
        description={
          statusConfirm?.status === "active"
            ? "停權後該職員將無法登入後台；歷史活動與審核紀錄的關聯保留。系統至少須保留一位有效的系統管理員。"
            : "復職後該職員可重新登入後台。"
        }
        isConfirmDanger={statusConfirm?.status === "active"}
        isLoading={isActing}
        onConfirm={confirmStatus}
        onClose={() => setStatusConfirm(null)}
      />

      <ConfirmDialog
        open={resetPwTarget !== null}
        title={resetPwTarget ? `重置 ${resetPwTarget.full_name} 的密碼？` : ""}
        description={
          resetPwTarget
            ? `將把密碼重置為帳號「${resetPwTarget.username}」，該職員首次登入時系統會強制要求設定新密碼。`
            : ""
        }
        isLoading={isActing}
        onConfirm={confirmResetPw}
        onClose={() => setResetPwTarget(null)}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget ? `封存 ${archiveTarget.full_name}？` : ""}
        description="封存後該職員將自名冊隱藏並停用登入（可於「顯示已封存」中還原）。歷史紀錄保留；帳號不會被自動刪除。若其名下仍有負責學生，請先移轉再封存。"
        isConfirmDanger
        isLoading={isActing}
        onConfirm={confirmArchive}
        onClose={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `永久刪除 ${deleteTarget.full_name}？` : ""}
        description="將永久刪除該職員的帳號與登入（無法復原）。其經手的歷史紀錄（活動建立、審核、補登）會保留但操作人改為留空。若名下仍有負責學生，請先移轉。"
        confirmText="永久刪除"
        isConfirmDanger
        requireText={deleteTarget?.full_name}
        isLoading={isActing}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={roleConfirm !== null}
        title={
          roleConfirm
            ? `將 ${roleConfirm.row.full_name} 的角色改為${STAFF_ROLE[roleConfirm.role]}？`
            : ""
        }
        description="角色決定後台權限範圍，變更後立即生效。系統至少須保留一位系統管理員。"
        isLoading={isActing}
        onConfirm={confirmRoleChange}
        onClose={() => setRoleConfirm(null)}
      />

      {editTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setEditTarget(null)}
            aria-label="關閉"
          />
          {/* 內容較高（6 欄），限制在視窗高度內、表單區自行捲動，避免小螢幕顯示不全 */}
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="overflow-y-auto px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">編輯職員基本資料</h3>
              <p className="mt-1 text-sm text-slate-500">
                姓名與職稱由系統管理員在此維護；職員可於側欄「帳號設定」自改電話、地區、Email、帳號。
              </p>
              <div className="mt-4 space-y-4">
                <Field label="姓名" required error={editErrors.fullName}>
                  <input
                    className={inputClass}
                    value={editForm.fullName}
                    onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </Field>
                <Field label="聯絡電話" required error={editErrors.phone}>
                  <input
                    className={inputClass}
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </Field>
                <Field label="地區">
                  <Select
                    value={editForm.region}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, region: v }))}
                    placeholder="請選擇地區"
                    options={YILAN_REGIONS.map((r) => ({ value: r, label: r }))}
                    menuClassName="bg-white"
                  />
                </Field>
                <Field
                  label="Email"
                  required
                  error={editErrors.email}
                  hint="同時是該職員的登入信箱，變更後即刻生效"
                >
                  <input
                    type="email"
                    className={inputClass}
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </Field>
                <Field
                  label="帳號"
                  required
                  error={editErrors.username}
                  hint="該職員以此帳號登入，變更後即刻生效（密碼不變）"
                >
                  <input
                    className={inputClass}
                    value={editForm.username}
                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </Field>
                <Field label="職稱" required>
                  <Select
                    value={editForm.jobTitle}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, jobTitle: v as StaffJobTitle }))
                    }
                    options={Object.entries(STAFF_JOB_TITLE).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    menuClassName="bg-white"
                  />
                </Field>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button size="sm" variant="ghost" disabled={isActing} onClick={() => setEditTarget(null)}>
                取消
              </Button>
              <Button size="sm" isLoading={isActing} onClick={submitEdit}>
                儲存
              </Button>
            </div>
          </div>
        </div>
      )}

      {reassignFrom && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setReassignFrom(null)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">移轉學生</h3>
              <p className="mt-1 text-sm text-slate-500">
                將{" "}
                <span className="font-semibold text-slate-700">{reassignFrom.full_name}</span>{" "}
                名下目前 {workerCounts[reassignFrom.id] ?? 0} 位學生，一次全部改派給另一位在職社工。
              </p>
              <div className="mt-4 space-y-4">
                <Field label="移轉給" hint="僅列出在職社工。">
                  <Select
                    value={reassignTo}
                    onValueChange={setReassignTo}
                    placeholder={reassignTargets.length ? "選擇社工" : "沒有其他在職社工"}
                    options={reassignTargets.map((w) => ({ value: w.id, label: w.full_name }))}
                    menuClassName="bg-white"
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button
                size="sm"
                variant="ghost"
                disabled={isActing}
                onClick={() => setReassignFrom(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                isLoading={isActing}
                disabled={!reassignTo}
                onClick={handleReassign}
              >
                確定移轉
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
