"use client";

// 帳號審核：兩個分頁
//  - accounts：待審核註冊（核准須同時指定負責社工；支援批次核准指定同一社工）
//  - deactivation：學生提出的停用申請（核准＝停權＋級聯取消未來報名）

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { reviewVolunteerAccount } from "@/lib/actions/admin-users";
import { reviewDeactivationRequest } from "@/lib/actions/deactivation";
import { useAdminProfile } from "../admin-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PageHeader,
  Panel,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  TabBar,
  BatchBar,
  RowActionMenu,
} from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { useSelection } from "@/components/admin/use-selection";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import { formatDate, formatDateTime } from "@/lib/admin/datetime";
import type { GradeLevel } from "@/lib/types/database";

type TabKey = "accounts" | "deactivation";

interface AccountRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  region: string | null;
  grade: GradeLevel;
  birth_date: string;
  created_at: string;
}

interface DeactivationRow {
  id: string;
  reason: string | null;
  created_at: string;
  volunteer: { id: string; full_name: string } | null;
}

interface WorkerOption {
  id: string;
  full_name: string;
}

function VolunteerReviewInner() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = useAdminProfile();
  // 帳號審核／停用審核的 RPC 皆需單位管理員以上；一般職員不顯示此功能。
  const isAdmin = profile.role === "system_admin" || profile.role === "unit_admin";
  const tab = (searchParams.get("tab") as TabKey) || "accounts";

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [deactivations, setDeactivations] = useState<DeactivationRow[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [counts, setCounts] = useState({ accounts: 0, deactivation: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isBatching, setIsBatching] = useState(false);
  // 審核決定無法直接復原，一律先確認再執行
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    run: () => Promise<void>;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // 逐筆核准帳號時，各自選的負責社工
  const [rowWorker, setRowWorker] = useState<Record<string, string>>({});
  // 批次核准時統一指定的社工
  const [batchWorker, setBatchWorker] = useState("");

  const accountSelection = useSelection(accounts);

  const loadCounts = useCallback(async () => {
    const [a, d] = await Promise.all([
      supabase
        .from("volunteer_profiles")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_review"),
      supabase
        .from("deactivation_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    setCounts({ accounts: a.count ?? 0, deactivation: d.count ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    accountSelection.clear();
    const workersRes = await supabase
      .from("staff_profiles")
      .select("id, full_name")
      .eq("status", "active")
      .eq("job_title", "social_worker")
      .order("full_name");
    setWorkers((workersRes.data ?? []) as WorkerOption[]);

    if (tab === "accounts") {
      const { data, error } = await supabase
        .from("volunteer_profiles")
        .select("id, full_name, email, phone, region, grade, birth_date, created_at")
        .eq("status", "pending_review")
        .order("created_at", { ascending: true });
      if (error) toast.error(`載入失敗：${error.message}`);
      setAccounts((data ?? []) as AccountRow[]);
    } else {
      const { data, error } = await supabase
        .from("deactivation_requests")
        .select("id, reason, created_at, volunteer:volunteer_id(id, full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) toast.error(`載入失敗：${error.message}`);
      setDeactivations((data ?? []) as unknown as DeactivationRow[]);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    load();
  }, [load]);

  const workerOptions = useMemo(
    () => workers.map((w) => ({ value: w.id, label: w.full_name })),
    [workers]
  );

  const refreshAll = async () => {
    await Promise.all([load(), loadCounts()]);
  };

  const approveAccount = async (row: AccountRow) => {
    const workerId = rowWorker[row.id];
    if (!workerId) return void toast.error("請先為此學生指定負責社工");
    const result = await reviewVolunteerAccount(row.id, true, workerId);
    if (result.error) return void toast.error(result.error);
    toast.success(`已核准 ${row.full_name}`);
    await refreshAll();
  };

  const rejectAccount = async (row: AccountRow) => {
    const result = await reviewVolunteerAccount(row.id, false);
    if (result.error) return void toast.error(result.error);
    toast.success(`已拒絕 ${row.full_name}`);
    await refreshAll();
  };

  const batchApprove = async () => {
    if (!batchWorker) return void toast.error("請先選擇要統一指派的負責社工");
    const selectedRows = accounts.filter((a) => accountSelection.selected.has(a.id));
    setIsBatching(true);
    const results = await Promise.allSettled(
      selectedRows.map((row) => reviewVolunteerAccount(row.id, true, batchWorker))
    );
    setIsBatching(false);
    const failures = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error)
    );
    const ok = selectedRows.length - failures.length;
    if (failures.length === 0) toast.success(`已核准 ${ok} 筆`);
    else toast.error(`成功 ${ok} 筆，失敗 ${failures.length} 筆`);
    await refreshAll();
  };

  const reviewDeactivation = async (row: DeactivationRow, approve: boolean) => {
    const result = await reviewDeactivationRequest(row.id, approve);
    if (result.error) return void toast.error(getErrorMessage(result.error));
    toast.success(approve ? "已核准停用申請" : "已駁回停用申請");
    await refreshAll();
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setIsConfirming(true);
    await confirmAction.run();
    setIsConfirming(false);
    setConfirmAction(null);
  };

  const changeTab = (key: TabKey) => {
    router.push(`/admin/volunteer-review${key === "accounts" ? "" : `?tab=${key}`}`);
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "accounts", label: "帳號審核", count: counts.accounts },
    { key: "deactivation", label: "停用申請", count: counts.deactivation },
  ];

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="帳號審核" description="審核新註冊學生帳號與停用申請。" />
        <div className="flex-1 p-4 sm:p-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            此頁僅限單位管理員以上操作。
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="帳號審核"
        description="審核新註冊學生帳號與停用申請。核准帳號時須指定負責社工。"
      />
      <TabBar tabs={tabs} active={tab} onChange={changeTab} />

      <div className="flex-1 p-4 sm:p-6">
        {tab === "accounts" ? (
          <Panel padded={false}>
            <TableShell>
              <thead>
                <tr>
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      checked={accountSelection.allSelected}
                      onChange={accountSelection.toggleAll}
                      aria-label="全選"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                    />
                  </Th>
                  <Th>姓名</Th>
                  <Th>學制／生日</Th>
                  <Th>聯絡</Th>
                  <Th>註冊時間</Th>
                  <Th>負責社工</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <LoadingRow colSpan={7} />
                ) : accounts.length === 0 ? (
                  <EmptyRow colSpan={7} message="沒有待審核的帳號" />
                ) : (
                  accounts.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <Td>
                        <input
                          type="checkbox"
                          checked={accountSelection.selected.has(row.id)}
                          onChange={() => accountSelection.toggle(row.id)}
                          aria-label="選取"
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                        />
                      </Td>
                      <Td className="font-semibold text-slate-900">
                        {row.full_name}
                        <p className="text-xs font-normal text-slate-400">{row.region ?? "—"}</p>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {GRADE_LEVEL_LABELS[row.grade]}
                        <p className="text-xs text-slate-400">{formatDate(row.birth_date)}</p>
                      </Td>
                      <Td className="text-slate-500">
                        {row.phone}
                        <p className="text-xs text-slate-400">{row.email}</p>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(row.created_at)}
                      </Td>
                      <Td className="w-44">
                        <Select
                          value={rowWorker[row.id] ?? ""}
                          onValueChange={(v) => setRowWorker((prev) => ({ ...prev, [row.id]: v }))}
                          placeholder={workers.length ? "指定社工" : "無在職社工"}
                          options={workerOptions}
                          triggerClassName="py-1.5 text-xs"
                        />
                      </Td>
                      <Td className="text-right">
                        <RowActionMenu
                          ariaLabel={`${row.full_name} 的操作`}
                          actions={[
                            {
                              label: "核准",
                              icon: "check_circle",
                              onSelect: () => {
                                if (!rowWorker[row.id]) {
                                  return void toast.error("請先為此學生指定負責社工");
                                }
                                setConfirmAction({
                                  title: `核准 ${row.full_name} 的註冊？`,
                                  description:
                                    "核准後帳號立即啟用、指派所選社工並通知學生。審核結果無法直接復原。",
                                  run: () => approveAccount(row),
                                });
                              },
                            },
                            {
                              label: "拒絕",
                              icon: "cancel",
                              onSelect: () =>
                                setConfirmAction({
                                  title: `拒絕 ${row.full_name} 的註冊？`,
                                  description:
                                    "拒絕後保留紀錄、帳號無法登入使用，並通知學生。審核結果無法直接復原。",
                                  run: () => rejectAccount(row),
                                }),
                            },
                          ]}
                        />
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </Panel>
        ) : (
          <Panel padded={false}>
            <TableShell>
              <thead>
                <tr>
                  <Th>學生</Th>
                  <Th>停用原因</Th>
                  <Th>申請時間</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <LoadingRow colSpan={4} />
                ) : deactivations.length === 0 ? (
                  <EmptyRow colSpan={4} message="沒有待處理的停用申請" />
                ) : (
                  deactivations.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <Td>
                        {row.volunteer ? (
                          <Link
                            href={`/admin/volunteers/${row.volunteer.id}`}
                            className="font-semibold text-slate-900 hover:text-primary"
                          >
                            {row.volunteer.full_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="max-w-md text-slate-600">
                        {row.reason ? (
                          <span className="whitespace-pre-wrap">{row.reason}</span>
                        ) : (
                          <span className="text-slate-400">（未填寫）</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(row.created_at)}
                      </Td>
                      <Td className="text-right">
                        <RowActionMenu
                          ariaLabel={`${row.volunteer?.full_name ?? "停用申請"} 的操作`}
                          actions={[
                            {
                              label: "核准停用",
                              icon: "person_off",
                              onSelect: () =>
                                setConfirmAction({
                                  title: `核准 ${row.volunteer?.full_name ?? "該學生"} 的停用申請？`,
                                  description:
                                    "核准後帳號停權並連動取消未來報名、通知學生。審核結果無法直接復原（之後可於學生詳情頁復職）。",
                                  run: () => reviewDeactivation(row, true),
                                }),
                            },
                            {
                              label: "駁回",
                              icon: "undo",
                              onSelect: () =>
                                setConfirmAction({
                                  title: `駁回 ${row.volunteer?.full_name ?? "該學生"} 的停用申請？`,
                                  description: "駁回後帳號維持現狀並通知學生。",
                                  run: () => reviewDeactivation(row, false),
                                }),
                            },
                          ]}
                        />
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </Panel>
        )}
      </div>

      {tab === "accounts" && (
        <BatchBar count={accountSelection.selected.size} onClear={accountSelection.clear}>
          <div className="w-44">
            <Select
              value={batchWorker}
              onValueChange={setBatchWorker}
              placeholder="統一指派社工"
              options={workerOptions}
              triggerClassName="py-1.5 text-xs bg-white"
            />
          </div>
          <Button
            size="sm"
            isLoading={isBatching}
            onClick={() => {
              if (!batchWorker) return void toast.error("請先選擇要統一指派的負責社工");
              setConfirmAction({
                title: `批次核准 ${accountSelection.selected.size} 筆註冊？`,
                description:
                  "核准後帳號立即啟用、統一指派所選社工並逐筆通知學生。審核結果無法直接復原。",
                run: batchApprove,
              });
            }}
          >
            批次核准
          </Button>
        </BatchBar>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description}
        isLoading={isConfirming || isBatching}
        onConfirm={handleConfirmAction}
        onClose={() => setConfirmAction(null)}
      />
    </>
  );
}

export default function VolunteerReviewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">載入中…</div>}>
      <VolunteerReviewInner />
    </Suspense>
  );
}
