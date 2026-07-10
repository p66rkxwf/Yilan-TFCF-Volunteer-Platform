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
  RowActionMenu,
} from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { useAdminProfile } from "../admin-context";
import {
  archiveRecord,
  restoreRecord,
  deleteRecordPermanently,
} from "@/lib/actions/admin-archive";
import { ANNOUNCEMENT_STATUS } from "@/lib/admin/labels";
import { formatDateTime } from "@/lib/admin/datetime";
import type { Announcement, AnnouncementStatus } from "@/lib/types/database";

interface AnnRow extends Announcement {
  creator: { full_name: string } | null;
}

export default function AnnouncementsPage() {
  const supabase = createClient();
  const toast = useToast();
  const profile = useAdminProfile();
  const isSysAdmin = profile.role === "system_admin";

  const [rows, setRows] = useState<AnnRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AnnRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnRow | null>(null);
  // 發布／下架屬前台可見性切換，加確認避免誤觸
  const [statusConfirm, setStatusConfirm] = useState<{
    row: AnnRow;
    status: AnnouncementStatus;
  } | null>(null);
  const [isActing, setIsActing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    let q = supabase
      .from("announcements")
      .select("*, creator:created_by(full_name)")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    q = showArchived ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) toast.error(`載入公告失敗：${error.message}`);
    else setRows((data ?? []) as unknown as AnnRow[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

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

  const confirmSetStatus = async () => {
    if (!statusConfirm) return;
    const { row, status } = statusConfirm;
    setIsActing(true);
    try {
      const payload: Record<string, unknown> = { status };
      if (status === "published" && !row.published_at) {
        payload.published_at = new Date().toISOString();
      }
      const { error } = await supabase.from("announcements").update(payload).eq("id", row.id);
      if (error) throw error;
      toast.success(status === "published" ? "已發布" : "已下架");
      setStatusConfirm(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setIsActing(false);
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

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setIsActing(true);
    const result = await archiveRecord("announcements", archiveTarget.id);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success("公告已封存（可於「顯示已封存」中還原）");
    setArchiveTarget(null);
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsActing(true);
    const result = await deleteRecordPermanently("announcements", deleteTarget.id);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success(`已永久刪除「${deleteTarget.title}」`);
    setDeleteTarget(null);
    await load();
  };

  const restore = async (row: AnnRow) => {
    const result = await restoreRecord("announcements", row.id);
    if (result.error) return void toast.error(result.error);
    toast.success("公告已還原");
    await load();
  };

  return (
    <>
      <PageHeader
        title="公告管理"

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

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <Panel padded={false} fill>
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
            {isSysAdmin && (
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
                      <RowActionMenu
                        ariaLabel={`${row.title} 的操作`}
                        actions={
                          showArchived
                            ? [
                                { label: "還原", icon: "restore", onSelect: () => restore(row) },
                                isSysAdmin && {
                                  label: "永久刪除",
                                  icon: "delete_forever",
                                  danger: true,
                                  onSelect: () => setDeleteTarget(row),
                                },
                              ]
                            : [
                                {
                                  label: "編輯",
                                  icon: "edit",
                                  href: `/admin/announcements/${row.id}/edit`,
                                },
                                {
                                  label: row.is_pinned ? "取消置頂" : "置頂",
                                  icon: "push_pin",
                                  onSelect: () => togglePin(row),
                                },
                                row.status === "published"
                                  ? {
                                      label: "下架",
                                      icon: "visibility_off",
                                      onSelect: () =>
                                        setStatusConfirm({ row, status: "unpublished" }),
                                    }
                                  : {
                                      label: "發布",
                                      icon: "publish",
                                      onSelect: () =>
                                        setStatusConfirm({ row, status: "published" }),
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
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="封存公告？"
        description={`「${archiveTarget?.title ?? ""}」將被封存並自前台/列表隱藏，可於「顯示已封存」中還原。超過保留天數後才會永久清除。`}
        isConfirmDanger
        isLoading={isActing}
        onConfirm={confirmArchive}
        onClose={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `永久刪除「${deleteTarget.title}」？` : ""}
        description="公告將被永久刪除（無法復原）。若僅需自前台隱藏請改用「下架」或「封存」。"
        confirmText="永久刪除"
        isConfirmDanger
        requireText={deleteTarget?.title}
        isLoading={isActing}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={statusConfirm !== null}
        title={
          statusConfirm
            ? statusConfirm.status === "published"
              ? `發布「${statusConfirm.row.title}」？`
              : `下架「${statusConfirm.row.title}」？`
            : ""
        }
        description={
          statusConfirm?.status === "published"
            ? "發布後前台（含未登入訪客）立即可見此公告。"
            : "下架後前台立即隱藏此公告，可隨時再發布。"
        }
        isLoading={isActing}
        onConfirm={confirmSetStatus}
        onClose={() => setStatusConfirm(null)}
      />
    </>
  );
}
