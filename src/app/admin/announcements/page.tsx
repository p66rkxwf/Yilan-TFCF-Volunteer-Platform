"use client";

// 公告管理（所有職員可完整 CRUD）：發布／下架／置頂／刪除。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
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
} from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { ANNOUNCEMENT_STATUS } from "@/lib/admin/labels";
import { formatDateTime } from "@/lib/admin/datetime";
import type { Announcement, AnnouncementStatus } from "@/lib/types/database";

interface AnnRow extends Announcement {
  creator: { full_name: string } | null;
}

export default function AnnouncementsPage() {
  const supabase = createClient();
  const toast = useToast();

  const [rows, setRows] = useState<AnnRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<AnnRow | null>(null);
  const [isActing, setIsActing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("announcements")
      .select("*, creator:created_by(full_name)")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(`載入公告失敗：${error.message}`);
    else setRows((data ?? []) as unknown as AnnRow[]);
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
      if (q && !row.title.includes(q)) return false;
      return true;
    });
  }, [rows, statusFilter, search]);

  const setStatus = async (row: AnnRow, status: AnnouncementStatus) => {
    try {
      const payload: Record<string, unknown> = { status };
      if (status === "published" && !row.published_at) {
        payload.published_at = new Date().toISOString();
      }
      const { error } = await supabase.from("announcements").update(payload).eq("id", row.id);
      if (error) throw error;
      toast.success(status === "published" ? "已發布" : "已下架");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    }
  };

  const togglePin = async (row: AnnRow) => {
    try {
      const { error } = await supabase
        .from("announcements")
        .update({ is_pinned: !row.is_pinned })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(row.is_pinned ? "已取消置頂" : "已置頂");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsActing(true);
    try {
      const { error } = await supabase.from("announcements").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("公告已刪除");
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setIsActing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="公告管理"
        description="學生僅能看到已發布的公告，置頂公告優先顯示。"
        actions={
          <Link
            href="/admin/announcements/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增公告
          </Link>
        }
      />

      <div className="flex-1 p-4 sm:p-6">
        <Panel padded={false}>
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜尋標題…"
              className="w-56"
            />
            <div className="w-32">
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
                options={[
                  { value: "all", label: "全部狀態" },
                  ...Object.entries(ANNOUNCEMENT_STATUS).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  })),
                ]}
              />
            </div>
            <p className="ml-auto text-xs text-slate-400">共 {filtered.length} 則</p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <Th>標題</Th>
                <Th>狀態</Th>
                <Th>建立者</Th>
                <Th>發布時間</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={5} />
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={5} message="沒有符合的公告" />
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {row.is_pinned && (
                          <span className="material-symbols-outlined text-[16px] text-amber-500">
                            push_pin
                          </span>
                        )}
                        <Link
                          href={`/admin/announcements/${row.id}/edit`}
                          className="font-semibold text-slate-900 hover:text-primary"
                        >
                          {row.title}
                        </Link>
                      </span>
                    </Td>
                    <Td>
                      <StatusPill meta={ANNOUNCEMENT_STATUS[row.status]} />
                    </Td>
                    <Td className="text-slate-500">{row.creator?.full_name ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {row.published_at ? formatDateTime(row.published_at) : "—"}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => togglePin(row)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          {row.is_pinned ? "取消置頂" : "置頂"}
                        </button>
                        {row.status === "published" ? (
                          <button
                            onClick={() => setStatus(row, "unpublished")}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                          >
                            下架
                          </button>
                        ) : (
                          <button
                            onClick={() => setStatus(row, "published")}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            發布
                          </button>
                        )}
                        <Link
                          href={`/admin/announcements/${row.id}/edit`}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                        >
                          編輯
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(row)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          刪除
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除公告？"
        description={`「${deleteTarget?.title ?? ""}」將被永久刪除，此操作不可復原。`}
        isConfirmDanger
        isLoading={isActing}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
