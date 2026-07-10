"use client";

// 活動管理：列表＋篩選。所有編輯／場次／審核操作都在活動詳情頁進行。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../admin-context";
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
  Pagination,
  RowActionMenu,
} from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  archiveRecord,
  restoreRecord,
  deleteRecordPermanently,
} from "@/lib/actions/admin-archive";
import { ACTIVITY_STATUS, ACTIVITY_TYPE } from "@/lib/admin/labels";
import { formatSessionRange } from "@/lib/admin/datetime";
import type { Activity, ActivityStatus } from "@/lib/types/database";

const PAGE_SIZE = 20;

interface ActivityRow extends Activity {
  activity_sessions: { id: string; start_at: string; end_at: string; cancelled_at: string | null }[];
  creator: { full_name: string } | null;
}

export default function AdminActivitiesPage() {
  const supabase = createClient();
  const toast = useToast();
  const profile = useAdminProfile();
  const isSysAdmin = profile.role === "system_admin";

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all"); // all | mine
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ActivityRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActivityRow | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setIsLoading(true);
    let q = supabase
      .from("activities")
      .select(
        "*, activity_sessions(id, start_at, end_at, cancelled_at), creator:created_by(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    q = showArchived ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) toast.error(`載入活動失敗：${error.message}`);
    else setRows((data ?? []) as unknown as ActivityRow[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setIsActing(true);
    const result = await archiveRecord("activities", archiveTarget.id);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success("活動已封存（前台不再顯示，可於「顯示已封存」中還原）");
    setArchiveTarget(null);
    await load();
  };

  const restore = async (row: ActivityRow) => {
    const result = await restoreRecord("activities", row.id);
    if (result.error) return void toast.error(result.error);
    toast.success("活動已還原");
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsActing(true);
    const result = await deleteRecordPermanently("activities", deleteTarget.id);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success(`已永久刪除「${deleteTarget.title}」與其場次、報名紀錄`);
    setDeleteTarget(null);
    await load();
  };

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (scopeFilter === "mine" && row.created_by !== profile.id) return false;
      const q = search.trim();
      if (q && !row.title.includes(q) && !row.location.includes(q)) return false;
      return true;
    });
  }, [rows, statusFilter, scopeFilter, search, profile.id]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 下一場未取消場次（未來優先，否則顯示最近一場）
  const nextSessionText = (row: ActivityRow) => {
    const active = row.activity_sessions
      .filter((s) => !s.cancelled_at)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
    if (active.length === 0) return "—";
    const now = new Date().toISOString();
    const upcoming = active.find((s) => s.end_at >= now);
    const target = upcoming ?? active[active.length - 1];
    return formatSessionRange(target.start_at, target.end_at);
  };

  return (
    <>
      <PageHeader
        title="活動管理"

        actions={
          <Link
            href="/admin/activities/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增活動
          </Link>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <Panel padded={false} fill>
          <Toolbar>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="搜尋標題或地點…"
              className="w-56"
            />
            <div className="w-36">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "全部狀態" },
                  ...Object.entries(ACTIVITY_STATUS).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  })),
                ]}
              />
            </div>
            <div className="w-40">
              <Select
                value={scopeFilter}
                onValueChange={(v) => {
                  setScopeFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "全部活動" },
                  { value: "mine", label: "我建立的活動" },
                ]}
              />
            </div>
            {isSysAdmin && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => {
                    setShowArchived(e.target.checked);
                    setPage(1);
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/30"
                />
                顯示已封存
              </label>
            )}
            <p className="ml-auto text-xs text-slate-400">共 {filtered.length} 筆</p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <Th>活動</Th>
                <Th>類型</Th>
                <Th>狀態</Th>
                <Th className="text-right">場次數</Th>
                <Th>下一場</Th>
                <Th>建立者</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={7} />
              ) : paged.length === 0 ? (
                <EmptyRow colSpan={7} message="沒有符合條件的活動" />
              ) : (
                paged.map((row) => {
                  const activeSessions = row.activity_sessions.filter((s) => !s.cancelled_at);
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <Td>
                        <Link
                          href={`/admin/activities/${row.id}`}
                          className="font-semibold text-slate-900 hover:text-primary"
                        >
                          {row.title}
                        </Link>
                        <p className="text-xs text-slate-400">{row.location}</p>
                      </Td>
                      <Td className="whitespace-nowrap">{ACTIVITY_TYPE[row.activity_type]}</Td>
                      <Td>
                        <StatusPill meta={ACTIVITY_STATUS[row.status as ActivityStatus]} />
                      </Td>
                      <Td className="text-right">
                        {activeSessions.length}
                        {row.activity_sessions.length !== activeSessions.length && (
                          <span className="text-xs text-slate-400">
                            （含取消 {row.activity_sessions.length}）
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">{nextSessionText(row)}</Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {row.creator?.full_name ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap text-right">
                        <RowActionMenu
                          ariaLabel={`${row.title} 的操作`}
                          actions={
                            showArchived
                              ? [
                                  isSysAdmin && {
                                    label: "還原",
                                    icon: "restore",
                                    onSelect: () => restore(row),
                                  },
                                  isSysAdmin && {
                                    label: "永久刪除",
                                    icon: "delete_forever",
                                    danger: true,
                                    onSelect: () => setDeleteTarget(row),
                                  },
                                ]
                              : [
                                  {
                                    label: "管理",
                                    icon: "tune",
                                    href: `/admin/activities/${row.id}`,
                                  },
                                  row.status !== "completed" &&
                                    row.status !== "cancelled" && {
                                      label: "編輯",
                                      icon: "edit",
                                      href: `/admin/activities/${row.id}/edit`,
                                    },
                                  isSysAdmin && {
                                    label: "封存",
                                    icon: "archive",
                                    onSelect: () => setArchiveTarget(row),
                                  },
                                  isSysAdmin && {
                                    label: "永久刪除",
                                    icon: "delete_forever",
                                    danger: true,
                                    onSelect: () => setDeleteTarget(row),
                                  },
                                ]
                          }
                        />
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>

          <Pagination
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            totalCount={filtered.length}
          />
        </Panel>
      </div>

      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget ? `封存「${archiveTarget.title}」？` : ""}
        description="封存後此活動與其場次將自前台隱藏（志工看不到），後台可於「顯示已封存」還原。歷史報名與時數保留；超過保留天數且無場次者才會永久刪除。"
        isConfirmDanger
        isLoading={isActing}
        onConfirm={confirmArchive}
        onClose={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `永久刪除「${deleteTarget.title}」？` : ""}
        description="將永久刪除此活動與其所有場次、報名與出席紀錄（無法復原），相關學生時數也會一併消失。若僅需自前台隱藏請改用「封存」。"
        confirmText="永久刪除"
        isConfirmDanger
        requireText={deleteTarget?.title}
        isLoading={isActing}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
