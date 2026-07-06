"use client";

// 場次點名：列出該場次「已核准」的報名，逐筆或批次登記出席／缺席／補登改判。
//  - 寬限期內（場次結束＋補登寬限天數）：可代登出席、標記缺席、互相修正（rpc_admin_check_in）
//  - 寬限期後或缺席改判：補登出席（rpc_makeup_attendance，無時間上限，
//    absent→補登會自動解除黑名單並回補時數）

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
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
  BatchBar,
} from "@/components/admin/ui";
import { useSelection } from "@/components/admin/use-selection";
import { ATTENDANCE_STATUS } from "@/lib/admin/labels";
import { formatSessionRange, formatDateTime } from "@/lib/admin/datetime";
import type { ActivitySession, AttendanceStatus } from "@/lib/types/database";

interface RosterRow {
  id: string;
  attendance: AttendanceStatus | null;
  checked_in_at: string | null;
  attendance_recorded_by: string | null;
  service_hours: number | null;
  volunteer: { id: string; full_name: string; phone: string } | null;
  recorder: { full_name: string } | null;
}

export default function SessionRosterPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const supabase = createClient();
  const toast = useToast();

  const [session, setSession] = useState<(ActivitySession & { activities: { id: string; title: string } | null }) | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [graceDays, setGraceDays] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [isBatching, setIsBatching] = useState(false);

  const { selected, toggle, toggleAll, clear, allSelected } = useSelection(rows);

  const load = useCallback(async () => {
    setIsLoading(true);
    clear();
    const [sessionRes, rosterRes, settingsRes] = await Promise.all([
      supabase
        .from("activity_sessions")
        .select("*, activities(id, title)")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase
        .from("registrations")
        .select(
          "id, attendance, checked_in_at, attendance_recorded_by, service_hours, volunteer:volunteer_id(id, full_name, phone), recorder:attendance_recorded_by(full_name)"
        )
        .eq("activity_session_id", sessionId)
        .eq("status", "approved")
        .order("created_at", { ascending: true }),
      supabase.from("system_settings").select("makeup_attendance_grace_days").maybeSingle(),
    ]);

    if (sessionRes.data) setSession(sessionRes.data as any);
    setRows((rosterRes.data ?? []) as unknown as RosterRow[]);
    if (settingsRes.data) setGraceDays((settingsRes.data as any).makeup_attendance_grace_days);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // 補登寬限期是否仍在（用於決定顯示代登/標缺 vs 補登）。
  const withinGrace = !session
    ? true
    : new Date().getTime() <= new Date(session.end_at).getTime() + graceDays * 24 * 60 * 60 * 1000;

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const refresh = async () => {
    const { data } = await supabase
      .from("registrations")
      .select(
        "id, attendance, checked_in_at, attendance_recorded_by, service_hours, volunteer:volunteer_id(id, full_name, phone), recorder:attendance_recorded_by(full_name)"
      )
      .eq("activity_session_id", sessionId)
      .eq("status", "approved")
      .order("created_at", { ascending: true });
    setRows((data ?? []) as unknown as RosterRow[]);
  };

  const checkIn = async (row: RosterRow, attendance: "attended" | "absent") => {
    setActingId(row.id);
    try {
      const { error } = await supabase.rpc("rpc_admin_check_in", {
        p_registration_id: row.id,
        p_attendance: attendance,
      });
      if (error) throw error;
      toast.success(attendance === "attended" ? "已登記出席" : "已標記缺席");
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setActingId(null);
    }
  };

  const makeup = async (row: RosterRow) => {
    setActingId(row.id);
    try {
      const { error } = await supabase.rpc("rpc_makeup_attendance", { p_registration_id: row.id });
      if (error) throw error;
      toast.success("已補登出席（如原為缺席，已自動解除對應黑名單並回補時數）");
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setActingId(null);
    }
  };

  const batchCheckIn = async (attendance: "attended" | "absent") => {
    setIsBatching(true);
    const results = await Promise.allSettled(
      selectedRows.map((row) =>
        supabase.rpc("rpc_admin_check_in", {
          p_registration_id: row.id,
          p_attendance: attendance,
        })
      )
    );
    const failures = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error)
    );
    setIsBatching(false);
    const ok = selectedRows.length - failures.length;
    if (failures.length === 0) {
      toast.success(`已處理 ${ok} 筆`);
    } else {
      const first =
        failures[0].status === "rejected"
          ? getErrorMessage((failures[0] as PromiseRejectedResult).reason)
          : (failures[0] as PromiseFulfilledResult<any>).value.error.message;
      toast.error(`成功 ${ok} 筆，失敗 ${failures.length} 筆：${first}`);
    }
    await refresh();
    clear();
  };

  const stats = useMemo(() => {
    const attended = rows.filter(
      (r) => r.attendance === "attended" || r.attendance === "makeup_attended"
    ).length;
    const absent = rows.filter((r) => r.attendance === "absent").length;
    const unmarked = rows.length - attended - absent;
    return { attended, absent, unmarked };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="場次點名"
        description={
          session
            ? `${session.activities?.title ?? ""}｜${formatSessionRange(session.start_at, session.end_at)}`
            : "—"
        }
        backHref="/admin/attendance"
        backLabel="出席簽到"
        actions={
          session?.activities ? (
            <Link
              href={`/admin/activities/${session.activities.id}`}
              className="inline-flex items-center rounded-lg border-2 border-zinc-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-zinc-100"
            >
              查看活動
            </Link>
          ) : undefined
        }
      />

      <div className="flex-1 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
            <span className="text-slate-500">已核准 </span>
            <span className="font-bold text-slate-900">{rows.length}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
            <span className="text-slate-500">出席 </span>
            <span className="font-bold text-emerald-600">{stats.attended}</span>
            <span className="mx-1.5 text-slate-300">|</span>
            <span className="text-slate-500">缺席 </span>
            <span className="font-bold text-rose-600">{stats.absent}</span>
            <span className="mx-1.5 text-slate-300">|</span>
            <span className="text-slate-500">未登記 </span>
            <span className="font-bold text-amber-600">{stats.unmarked}</span>
          </div>
          {!withinGrace && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
              已超過補登寬限期（{graceDays} 天），僅能使用「補登出席」（含缺席改判，無時間上限）。
            </div>
          )}
        </div>

        <Panel padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="全選"
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                  />
                </Th>
                <Th>學生</Th>
                <Th>出席狀態</Th>
                <Th>簽到時間</Th>
                <Th>登記人／時數</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={6} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={6} message="此場次沒有已核准的報名" />
              ) : (
                rows.map((row) => {
                  const done = row.attendance === "attended" || row.attendance === "makeup_attended";
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <Td>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                          aria-label="選取"
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                        />
                      </Td>
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
                        <p className="text-xs text-slate-400">{row.volunteer?.phone ?? ""}</p>
                      </Td>
                      <Td>
                        {row.attendance ? (
                          <StatusPill meta={ATTENDANCE_STATUS[row.attendance]} />
                        ) : (
                          <span className="text-xs text-slate-400">未登記</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(row.checked_in_at)}
                      </Td>
                      <Td className="text-slate-500">
                        {row.attendance_recorded_by
                          ? row.recorder?.full_name ?? "—"
                          : row.attendance
                          ? "學生自行簽到"
                          : "—"}
                        {row.service_hours != null && (
                          <span className="ml-1 text-xs text-slate-400">
                            （{row.service_hours} 小時）
                          </span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {withinGrace ? (
                            <>
                              {row.attendance !== "attended" && row.attendance !== "makeup_attended" && (
                                <button
                                  disabled={actingId === row.id}
                                  onClick={() => checkIn(row, "attended")}
                                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                >
                                  出席
                                </button>
                              )}
                              {row.attendance !== "absent" && (
                                <button
                                  disabled={actingId === row.id}
                                  onClick={() => checkIn(row, "absent")}
                                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  缺席
                                </button>
                              )}
                              {done && (
                                <span className="px-2 text-xs font-semibold text-emerald-600">✓</span>
                              )}
                            </>
                          ) : (
                            <>
                              {!done ? (
                                <button
                                  disabled={actingId === row.id}
                                  onClick={() => makeup(row)}
                                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                                >
                                  {row.attendance === "absent" ? "缺席改判・補登出席" : "補登出席"}
                                </button>
                              ) : (
                                <span className="px-2 text-xs font-semibold text-emerald-600">✓ 已出席</span>
                              )}
                            </>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      {withinGrace && (
        <BatchBar count={selectedRows.length} onClear={clear}>
          <Button size="sm" isLoading={isBatching} onClick={() => batchCheckIn("attended")}>
            批次登記出席
          </Button>
          <Button size="sm" variant="danger" isLoading={isBatching} onClick={() => batchCheckIn("absent")}>
            批次標記缺席
          </Button>
        </BatchBar>
      )}
    </>
  );
}
