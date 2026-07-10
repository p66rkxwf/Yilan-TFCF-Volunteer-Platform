"use client";

// 操作紀錄（僅系統管理員可讀，RLS 強制）：誰、何時、做了什麼。
// 不含修改前後差異；系統自動行為操作人留空。支援日期區間篩選。

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../admin-context";
import {
  PageHeader,
  Panel,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  Toolbar,
  Field,
  inputClass,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { AUDIT_ACTION_LABELS, AUDIT_ACTOR_KIND_LABELS } from "@/lib/admin/labels";
import { formatDateTime } from "@/lib/admin/datetime";

interface LogRow {
  id: string;
  created_at: string;
  action: string;
  target_table: string;
  target_id: string;
  actor_id: string | null;
  actor_kind: string | null;
  actorName: string | null;
}

function todayTaipei(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000 + 8 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

export default function LogsPage() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const profile = useAdminProfile();

  const [rows, setRows] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(todayTaipei(-7));
  const [dateTo, setDateTo] = useState(todayTaipei(0));

  // 非系統管理員直接導出（RLS 也會讓查詢回空）
  useEffect(() => {
    if (profile.role !== "system_admin") {
      router.replace("/admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    const fromIso = new Date(`${dateFrom}T00:00:00+08:00`).toISOString();
    const toIso = new Date(`${dateTo}T23:59:59+08:00`).toISOString();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, created_at, action, target_table, target_id, actor_id, actor_kind")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast.error(`載入操作紀錄失敗：${error.message}`);
      setIsLoading(false);
      return;
    }

    // actor_id 可能是職員或志工（外鍵已放寬至 auth.users），故兩張表都查後組名。
    const base = (data ?? []) as unknown as Omit<LogRow, "actorName">[];
    const ids = [...new Set(base.map((r) => r.actor_id).filter(Boolean))] as string[];
    const nameMap = new Map<string, string>();
    if (ids.length > 0) {
      const [{ data: staff }, { data: vols }] = await Promise.all([
        supabase.from("staff_profiles").select("id, full_name").in("id", ids),
        supabase.from("volunteer_profiles").select("id, full_name").in("id", ids),
      ]);
      for (const s of (staff ?? []) as { id: string; full_name: string }[]) nameMap.set(s.id, s.full_name);
      for (const v of (vols ?? []) as { id: string; full_name: string }[])
        if (!nameMap.has(v.id)) nameMap.set(v.id, v.full_name);
    }
    setRows(
      base.map((r) => ({
        ...r,
        actorName: r.actor_id ? nameMap.get(r.actor_id) ?? null : null,
      }))
    );
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="操作紀錄" description="記錄誰、何時、做了什麼；系統自動行為操作人留空。" />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <Panel padded={false} fill>
          <Toolbar>
            <div className="flex items-end gap-2">
              <Field label="起始日期">
                <input
                  type="date"
                  className={`${inputClass} date-input`}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </Field>
              <Field label="結束日期">
                <input
                  type="date"
                  className={`${inputClass} date-input`}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </Field>
              <Button size="sm" variant="outline" onClick={load}>
                查詢
              </Button>
            </div>
            <p className="ml-auto text-xs text-slate-400">共 {rows.length} 筆（上限 1000）</p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <Th>時間</Th>
                <Th>操作</Th>
                <Th>對象</Th>
                <Th>操作人</Th>
                <Th>身分</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={5} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={5} message="此區間沒有操作紀錄" />
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDateTime(row.created_at)}
                    </Td>
                    <Td className="font-medium text-slate-800">
                      {AUDIT_ACTION_LABELS[row.action] ?? row.action}
                    </Td>
                    <Td className="text-slate-500">
                      {row.target_table}
                      <span className="ml-1 font-mono text-xs text-slate-400">
                        {row.target_id.slice(0, 8)}
                      </span>
                    </Td>
                    <Td className="text-slate-600">
                      {row.actorName ?? (row.actor_kind === "volunteer" ? "（已移除的志工）" : "系統自動")}
                    </Td>
                    <Td className="text-slate-500">
                      {AUDIT_ACTOR_KIND_LABELS[row.actor_kind ?? "system"] ?? "—"}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>
    </>
  );
}
