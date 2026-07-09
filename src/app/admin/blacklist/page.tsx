"use client";

// 黑名單管理：生效中事件（可提前解除／延長）與歷史紀錄。
// 手動加入黑名單在學生詳情頁操作（需先選定學生）。

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { useAdminProfile } from "../admin-context";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  TabBar,
  Field,
  RowActionMenu,
  inputClass,
} from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateTime, isoToTaipeiLocal, taipeiLocalToIso } from "@/lib/admin/datetime";
import type { BlacklistEvent } from "@/lib/types/database";

type TabKey = "active" | "history";

interface EventRow extends BlacklistEvent {
  volunteer: { id: string; full_name: string } | null;
  releaser: { full_name: string } | null;
}

function BlacklistInner() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = useAdminProfile();
  const isAdmin = profile.role === "system_admin" || profile.role === "unit_admin";
  const tab = (searchParams.get("tab") as TabKey) || "active";

  const [rows, setRows] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState({ active: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const [adjustEvent, setAdjustEvent] = useState<EventRow | null>(null);
  const [newRelease, setNewRelease] = useState("");
  // 提前解除後事件即關閉（無法恢復生效），先確認
  const [releaseTarget, setReleaseTarget] = useState<EventRow | null>(null);
  const [isActing, setIsActing] = useState(false);

  const loadCounts = useCallback(async () => {
    const { count } = await supabase
      .from("blacklist_events")
      .select("*", { count: "exact", head: true })
      .is("released_at", null);
    setCounts({ active: count ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    let query = supabase
      .from("blacklist_events")
      .select("*, volunteer:volunteer_id(id, full_name), releaser:released_by(full_name)");
    query =
      tab === "active"
        ? query.is("released_at", null).order("expected_release_at", { ascending: true })
        : query.not("released_at", "is", null).order("released_at", { ascending: false });
    const { data, error } = await query.limit(500);
    if (error) toast.error(`載入黑名單失敗：${error.message}`);
    else setRows((data ?? []) as unknown as EventRow[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdjust = (event: EventRow) => {
    setAdjustEvent(event);
    setNewRelease(isoToTaipeiLocal(event.expected_release_at));
  };

  const confirmRelease = async () => {
    if (!releaseTarget) return;
    setIsActing(true);
    try {
      const { error } = await supabase.rpc("rpc_adjust_blacklist", {
        p_event_id: releaseTarget.id,
        p_new_release_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("已提前解除");
      setReleaseTarget(null);
      await Promise.all([load(), loadCounts()]);
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setIsActing(false);
    }
  };

  const submitAdjust = async () => {
    if (!adjustEvent || !newRelease) return;
    setIsActing(true);
    try {
      const iso = taipeiLocalToIso(newRelease);
      const { error } = await supabase.rpc("rpc_adjust_blacklist", {
        p_event_id: adjustEvent.id,
        p_new_release_at: iso,
      });
      if (error) throw error;
      toast.success(
        new Date(iso) <= new Date() ? "已提前解除" : "已更新預計解除時間"
      );
      setAdjustEvent(null);
      await Promise.all([load(), loadCounts()]);
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setIsActing(false);
    }
  };

  const changeTab = (key: TabKey) => {
    router.push(`/admin/blacklist${key === "active" ? "" : `?tab=${key}`}`);
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "active", label: "生效中", count: counts.active },
    { key: "history", label: "歷史紀錄" },
  ];

  return (
    <>
      <PageHeader
        title="黑名單管理"
        description="多筆事件可重疊，全部解除後黑名單狀態才消失。手動加入請於學生詳情頁操作。"
      />
      <TabBar tabs={tabs} active={tab} onChange={changeTab} />

      <ConfirmDialog
        open={releaseTarget !== null}
        title={
          releaseTarget ? `提前解除 ${releaseTarget.volunteer?.full_name ?? ""} 的黑名單？` : ""
        }
        description="解除後該事件立即結束並通知學生；事件無法恢復生效（如需再列入須重新手動加入）。"
        isLoading={isActing}
        onConfirm={confirmRelease}
        onClose={() => setReleaseTarget(null)}
      />

      <div className="flex-1 p-4 sm:p-6">
        <Panel padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>學生</Th>
                <Th>列入時間</Th>
                <Th>預計解除</Th>
                {tab === "history" && <Th>實際解除</Th>}
                <Th>類型</Th>
                <Th>備註</Th>
                {tab === "active" && isAdmin && <Th className="text-right">操作</Th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={7} />
              ) : rows.length === 0 ? (
                <EmptyRow
                  colSpan={7}
                  message={tab === "active" ? "目前沒有生效中的黑名單" : "沒有歷史紀錄"}
                />
              ) : (
                rows.map((event) => (
                  <tr key={event.id} className="transition-colors hover:bg-slate-50">
                    <Td>
                      {event.volunteer ? (
                        <Link
                          href={`/admin/volunteers/${event.volunteer.id}`}
                          className="font-semibold text-slate-900 hover:text-primary"
                        >
                          {event.volunteer.full_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDateTime(event.triggered_at)}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDateTime(event.expected_release_at)}
                    </Td>
                    {tab === "history" && (
                      <Td className="whitespace-nowrap">
                        <span className="text-emerald-600">{formatDateTime(event.released_at)}</span>
                        <span className="ml-1 text-xs text-slate-400">
                          （{event.releaser?.full_name ?? "系統自動"}）
                        </span>
                      </Td>
                    )}
                    <Td>
                      {event.is_manual ? (
                        <StatusPill meta={{ label: "手動", badge: "bg-slate-200 text-slate-600" }} />
                      ) : (
                        <StatusPill meta={{ label: "自動（缺席）", badge: "bg-amber-100 text-amber-700" }} />
                      )}
                    </Td>
                    <Td className="max-w-xs text-slate-500">{event.note ?? "—"}</Td>
                    {tab === "active" && isAdmin && (
                      <Td className="text-right">
                        <RowActionMenu
                          ariaLabel={`${event.volunteer?.full_name ?? "黑名單事件"} 的操作`}
                          actions={[
                            {
                              label: "延長／改期",
                              icon: "edit_calendar",
                              onSelect: () => openAdjust(event),
                            },
                            {
                              label: "提前解除",
                              icon: "lock_open",
                              disabled: isActing,
                              onSelect: () => setReleaseTarget(event),
                            },
                          ]}
                        />
                      </Td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      {adjustEvent && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setAdjustEvent(null)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">調整黑名單解除時間</h3>
              <p className="mt-1 text-sm text-slate-500">
                {adjustEvent.volunteer?.full_name}｜設定新的預計解除時間；若設為現在或更早，將立即解除。
              </p>
              <div className="mt-4">
                <Field label="預計解除時間">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={newRelease}
                    onChange={(e) => setNewRelease(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button size="sm" variant="ghost" disabled={isActing} onClick={() => setAdjustEvent(null)}>
                取消
              </Button>
              <Button size="sm" isLoading={isActing} onClick={submitAdjust}>
                確定
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function BlacklistPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">載入中…</div>}>
      <BlacklistInner />
    </Suspense>
  );
}
