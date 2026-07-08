"use client";

// 職員管理：名冊、角色指派、停權／復職（皆限系統管理員；DB trigger 亦強制，
// 並保護最後一位系統管理員不可被停權或降級）。建立帳號走獨立頁面。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../admin-context";
import { setStaffRole, setStaffStatus, reassignWorker } from "@/lib/actions/admin-users";
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
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { STAFF_ROLE, STAFF_JOB_TITLE, STAFF_STATUS } from "@/lib/admin/labels";
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
  const [isActing, setIsActing] = useState(false);

  // 學生移轉對話框
  const [reassignFrom, setReassignFrom] = useState<StaffRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    const [staffRes, assignedRes] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id, full_name, username, email, phone, region, role, job_title, status")
        .order("created_at", { ascending: true }),
      supabase
        .from("volunteer_profiles")
        .select("assigned_worker_id")
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
  }, []);

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

  const changeRole = async (row: StaffRow, role: StaffRole) => {
    if (role === row.role) return;
    const result = await setStaffRole(row.id, role);
    if (result.error) return void toast.error(result.error);
    toast.success(`已將 ${row.full_name} 的角色設為${STAFF_ROLE[role]}`);
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

  return (
    <>
      <PageHeader
        title="職員管理"
        actions={
          isSystemAdmin ? (
            <Link
              href="/admin/staff/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              新增職員
            </Link>
          ) : undefined
        }
      />

      <div className="flex-1 p-4 sm:p-6">
        {!isSystemAdmin && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            角色指派、停權與建立帳號僅限系統管理員；學生移轉限單位管理員以上。
          </div>
        )}
        <Panel padded={false}>
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜尋姓名、帳號或電話…"
              className="w-56"
            />
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
                        {isSystemAdmin && !isSelf ? (
                          <Select
                            value={row.role}
                            onValueChange={(v) => changeRole(row, v as StaffRole)}
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
                          <div className="flex items-center justify-end gap-1">
                            {row.job_title === "social_worker" &&
                              (workerCounts[row.id] ?? 0) > 0 && (
                                <button
                                  onClick={() => openReassign(row)}
                                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                                >
                                  移轉學生
                                </button>
                              )}
                            {isSystemAdmin && !isSelf && (
                              <button
                                onClick={() => setStatusConfirm(row)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                  row.status === "active"
                                    ? "text-rose-600 hover:bg-rose-50"
                                    : "text-emerald-700 hover:bg-emerald-50"
                                }`}
                              >
                                {row.status === "active" ? "停權" : "復職"}
                              </button>
                            )}
                          </div>
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
