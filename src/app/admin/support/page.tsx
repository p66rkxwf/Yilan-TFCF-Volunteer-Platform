"use client";

// 支援需求收件匣：/support 頁送出的問題清單（含未登入訪客），可標記已處理／重新開啟。

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
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
  RowActionMenu,
} from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { SUPPORT_REQUEST_STATUS } from "@/lib/admin/labels";
import { formatDateTime } from "@/lib/admin/datetime";
import type { SupportRequest } from "@/lib/types/database";

export default function SupportRequestsPage() {
  const supabase = createClient();
  const toast = useToast();

  const [rows, setRows] = useState<SupportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [detailTarget, setDetailTarget] = useState<SupportRequest | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("support_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(`載入支援需求失敗：${error.message}`);
    else setRows((data ?? []) as SupportRequest[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      const q = search.trim();
      if (
        q &&
        !row.name.includes(q) &&
        !row.email.includes(q) &&
        !row.topic.includes(q) &&
        !row.message.includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const setResolved = async (row: SupportRequest, resolved: boolean) => {
    setActingId(row.id);
    try {
      const { error } = await supabase.rpc("rpc_resolve_support_request", {
        p_request_id: row.id,
        p_resolved: resolved,
      });
      if (error) throw error;
      toast.success(resolved ? "已標記為已處理" : "已重新開啟");
      setDetailTarget(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setActingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="支援需求"

      />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <Panel padded={false} fill>
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜尋姓名、Email、內容…"
              className="w-64"
            />
            <div className="w-32">
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
                options={[
                  { value: "all", label: "全部狀態" },
                  ...Object.entries(SUPPORT_REQUEST_STATUS).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  })),
                ]}
              />
            </div>
            <p className="ml-auto text-xs text-slate-400">共 {filtered.length} 筆</p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>聯絡人</Th>
                <Th>類型</Th>
                <Th>問題描述</Th>
                <Th>送出時間</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={6} />
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={6} message="沒有符合的支援需求" />
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <Td>
                      <StatusPill meta={SUPPORT_REQUEST_STATUS[row.status]} />
                    </Td>
                    <Td>
                      <button
                        onClick={() => setDetailTarget(row)}
                        className="text-left font-semibold text-slate-900 hover:text-primary"
                      >
                        {row.name}
                      </button>
                      <p className="text-xs text-slate-400">{row.email}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{row.topic}</Td>
                    <Td className="max-w-xs">
                      <button
                        onClick={() => setDetailTarget(row)}
                        className="block truncate text-left text-slate-700 hover:text-primary"
                      >
                        {row.message}
                      </button>
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDateTime(row.created_at)}
                    </Td>
                    <Td className="text-right">
                      <RowActionMenu
                        ariaLabel={`${row.name} 的操作`}
                        actions={[
                          { label: "查看內容", icon: "visibility", onSelect: () => setDetailTarget(row) },
                          row.status === "open"
                            ? {
                                label: "標記已處理",
                                icon: "task_alt",
                                disabled: actingId === row.id,
                                onSelect: () => setResolved(row, true),
                              }
                            : {
                                label: "重新開啟",
                                icon: "undo",
                                disabled: actingId === row.id,
                                onSelect: () => setResolved(row, false),
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
      </div>

      {detailTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDetailTarget(null)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{detailTarget.topic}</p>
                <h3 className="truncate text-lg font-bold text-slate-900">{detailTarget.name}</h3>
                <p className="truncate text-sm text-slate-500">{detailTarget.email}</p>
              </div>
              <StatusPill meta={SUPPORT_REQUEST_STATUS[detailTarget.status]} />
            </div>
            <div className="max-h-96 overflow-y-auto px-6 py-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {detailTarget.message}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <p className="text-xs text-slate-400">
                送出時間：{formatDateTime(detailTarget.created_at)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDetailTarget(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  關閉
                </button>
                {detailTarget.status === "open" ? (
                  <button
                    type="button"
                    onClick={() => setResolved(detailTarget, true)}
                    disabled={actingId === detailTarget.id}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    標記已處理
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setResolved(detailTarget, false)}
                    disabled={actingId === detailTarget.id}
                    className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    重新開啟
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
