"use client";

// 報名審核中心：三個分頁
//  - pending：待審核報名（批次核准／拒絕，逐筆呼叫 rpc_review_registration）
//  - cancel：取消申請待審（rpc_review_cancel）
//  - overdue：場次已結束仍待審的取消申請（人工待辦，v_overdue_cancel_reviews）

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
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
import { useSelection } from "@/components/admin/use-selection";
import { formatDateTime, formatSessionRange } from "@/lib/admin/datetime";

type TabKey = "pending" | "cancel" | "overdue";

interface ReviewRow {
  id: string;
  created_at: string;
  cancel_requested_at: string | null;
  volunteer: { id: string; full_name: string } | null;
  session: {
    start_at: string;
    end_at: string;
    activity: { id: string; title: string } | null;
  } | null;
}

function runBatch<T>(
  items: T[],
  fn: (item: T) => Promise<{ error?: { message: string } | null }>
) {
  return Promise.allSettled(items.map(fn)).then((results) => {
    const failures: string[] = [];
    results.forEach((r) => {
      if (r.status === "rejected") failures.push(getErrorMessage(r.reason));
      else if (r.value.error) failures.push(r.value.error.message);
    });
    return { total: items.length, failures };
  });
}

function RegistrationsInner() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabKey) || "pending";

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [counts, setCounts] = useState({ pending: 0, cancel: 0, overdue: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isBatching, setIsBatching] = useState(false);
  // 審核決定（核准／拒絕／駁回）狀態機不可回轉，一律先確認再執行
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    run: () => Promise<void>;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const { selected, toggle, toggleAll, clear, allSelected } = useSelection(rows);

  const loadCounts = useCallback(async () => {
    const [p, c, o] = await Promise.all([
      supabase.from("registrations").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("registrations").select("*", { count: "exact", head: true }).eq("status", "cancel_pending"),
      supabase.from("v_overdue_cancel_reviews").select("*", { count: "exact", head: true }),
    ]);
    setCounts({ pending: p.count ?? 0, cancel: c.count ?? 0, overdue: o.count ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    clear();
    const selectExpr =
      "id, created_at, cancel_requested_at, volunteer:volunteer_id(id, full_name), session:activity_session_id(start_at, end_at, activity:activity_id(id, title))";

    if (tab === "overdue") {
      // v_overdue_cancel_reviews 只有 registration_id 等欄位，取 id 再回撈明細
      const { data: overdue } = await supabase
        .from("v_overdue_cancel_reviews")
        .select("registration_id");
      const ids = ((overdue ?? []) as { registration_id: string }[]).map((r) => r.registration_id);
      if (ids.length === 0) {
        setRows([]);
      } else {
        const { data, error } = await supabase
          .from("registrations")
          .select(selectExpr)
          .in("id", ids)
          .order("cancel_requested_at", { ascending: true });
        if (error) toast.error(`載入失敗：${error.message}`);
        setRows((data ?? []) as unknown as ReviewRow[]);
      }
    } else {
      const status = tab === "pending" ? "pending" : "cancel_pending";
      const { data, error } = await supabase
        .from("registrations")
        .select(selectExpr)
        .eq("status", status)
        .order(tab === "pending" ? "created_at" : "cancel_requested_at", { ascending: true });
      if (error) toast.error(`載入失敗：${error.message}`);
      setRows((data ?? []) as unknown as ReviewRow[]);
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

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const changeTab = (key: TabKey) => {
    router.push(`/admin/registrations${key === "pending" ? "" : `?tab=${key}`}`);
  };

  // 批次：核准／拒絕報名
  const batchReview = async (approve: boolean) => {
    setIsBatching(true);
    const { total, failures } = await runBatch(selectedRows, (row) =>
      supabase.rpc("rpc_review_registration", { p_registration_id: row.id, p_approve: approve })
    );
    finishBatch(total, failures);
  };

  // 批次：核准／駁回取消申請
  const batchReviewCancel = async (approve: boolean) => {
    setIsBatching(true);
    const { total, failures } = await runBatch(selectedRows, (row) =>
      supabase.rpc("rpc_review_cancel", { p_registration_id: row.id, p_approve: approve })
    );
    finishBatch(total, failures);
  };

  const finishBatch = async (total: number, failures: string[]) => {
    setIsBatching(false);
    const ok = total - failures.length;
    if (failures.length === 0) {
      toast.success(`已處理 ${ok} 筆`);
    } else {
      toast.error(`成功 ${ok} 筆，失敗 ${failures.length} 筆：${failures[0]}`);
    }
    await Promise.all([load(), loadCounts()]);
  };

  const singleAction = async (
    row: ReviewRow,
    rpc: "rpc_review_registration" | "rpc_review_cancel",
    approve: boolean
  ) => {
    try {
      const { error } = await supabase.rpc(rpc, { p_registration_id: row.id, p_approve: approve });
      if (error) throw error;
      toast.success("已處理");
      await Promise.all([load(), loadCounts()]);
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setIsConfirming(true);
    await confirmAction.run();
    setIsConfirming(false);
    setConfirmAction(null);
  };

  const askSingle = (
    row: ReviewRow,
    rpc: "rpc_review_registration" | "rpc_review_cancel",
    approve: boolean
  ) => {
    const name = row.volunteer?.full_name ?? "該學生";
    const texts =
      rpc === "rpc_review_registration"
        ? approve
          ? { title: `核准 ${name} 的報名？`, description: "核准後正式佔用名額並通知學生。審核結果無法直接復原。" }
          : { title: `拒絕 ${name} 的報名？`, description: "拒絕後名額即時釋出並通知學生（學生仍可再次報名）。審核結果無法直接復原。" }
        : approve
          ? { title: `核准 ${name} 的取消申請？`, description: "核准後該報名將取消、名額釋出並通知學生。審核結果無法直接復原。" }
          : { title: `駁回 ${name} 的取消申請？`, description: "駁回後報名回到已核准狀態（將計入出席掃描）並通知學生。" };
    setConfirmAction({ ...texts, run: () => singleAction(row, rpc, approve) });
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "pending", label: "待審核報名", count: counts.pending },
    { key: "cancel", label: "取消審核", count: counts.cancel },
    { key: "overdue", label: "逾期待辦", count: counts.overdue },
  ];

  const colCount = tab === "overdue" ? 4 : 5;
  const supportsBatch = tab !== "overdue";

  return (
    <>
      <PageHeader
        title="報名審核"

      />
      <TabBar tabs={tabs} active={tab} onChange={changeTab} />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        {tab === "overdue" && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            以下取消申請的場次已結束仍未審核，不會自動處理，也不列入缺席掃描，請人工裁決：
            核准＝取消該報名；駁回＝回到已核准（將計入出席掃描）。
          </div>
        )}

        <Panel padded={false} fill>
          <TableShell>
            <thead>
              <tr>
                {supportsBatch && (
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="全選"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                    />
                  </Th>
                )}
                <Th>學生</Th>
                <Th>活動場次</Th>
                <Th>{tab === "pending" ? "報名時間" : "取消申請時間"}</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={colCount + 1} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={colCount + 1} message="目前沒有待處理的項目" />
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    {supportsBatch && (
                      <Td>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                          aria-label="選取"
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                        />
                      </Td>
                    )}
                    <Td>
                      {row.volunteer ? (
                        <Link prefetch={false}
                          href={`/admin/volunteers/${row.volunteer.id}`}
                          className="font-semibold text-slate-900 hover:text-primary"
                        >
                          {row.volunteer.full_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <p className="text-slate-800">{row.session?.activity?.title ?? "—"}</p>
                      <p className="text-xs text-slate-400">
                        {row.session
                          ? formatSessionRange(row.session.start_at, row.session.end_at)
                          : ""}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDateTime(tab === "pending" ? row.created_at : row.cancel_requested_at)}
                    </Td>
                    <Td className="text-right">
                      <RowActionMenu
                        ariaLabel={`${row.volunteer?.full_name ?? "報名"} 的操作`}
                        actions={
                          tab === "pending"
                            ? [
                                {
                                  label: "核准",
                                  icon: "check_circle",
                                  onSelect: () => askSingle(row, "rpc_review_registration", true),
                                },
                                {
                                  label: "拒絕",
                                  icon: "cancel",
                                  onSelect: () => askSingle(row, "rpc_review_registration", false),
                                },
                              ]
                            : [
                                {
                                  label: "核准取消",
                                  icon: "check_circle",
                                  onSelect: () => askSingle(row, "rpc_review_cancel", true),
                                },
                                {
                                  label: "駁回",
                                  icon: "undo",
                                  onSelect: () => askSingle(row, "rpc_review_cancel", false),
                                },
                              ]
                        }
                      />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      {supportsBatch && (
        <BatchBar count={selectedRows.length} onClear={clear}>
          {tab === "pending" ? (
            <>
              <Button
                size="sm"
                isLoading={isBatching}
                onClick={() =>
                  setConfirmAction({
                    title: `批次核准 ${selectedRows.length} 筆報名？`,
                    description: "核准後正式佔用名額並逐筆通知學生。審核結果無法直接復原。",
                    run: () => batchReview(true),
                  })
                }
              >
                批次核准
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isLoading={isBatching}
                onClick={() =>
                  setConfirmAction({
                    title: `批次拒絕 ${selectedRows.length} 筆報名？`,
                    description: "拒絕後名額即時釋出並逐筆通知學生。審核結果無法直接復原。",
                    run: () => batchReview(false),
                  })
                }
              >
                批次拒絕
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                isLoading={isBatching}
                onClick={() =>
                  setConfirmAction({
                    title: `批次核准 ${selectedRows.length} 筆取消申請？`,
                    description: "核准後該些報名將取消、名額釋出並逐筆通知學生。審核結果無法直接復原。",
                    run: () => batchReviewCancel(true),
                  })
                }
              >
                批次核准取消
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isLoading={isBatching}
                onClick={() =>
                  setConfirmAction({
                    title: `批次駁回 ${selectedRows.length} 筆取消申請？`,
                    description: "駁回後報名回到已核准狀態（將計入出席掃描）並逐筆通知學生。",
                    run: () => batchReviewCancel(false),
                  })
                }
              >
                批次駁回
              </Button>
            </>
          )}
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

export default function RegistrationsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">載入中…</div>}>
      <RegistrationsInner />
    </Suspense>
  );
}
