"use client";

// 出席簽到：場次清單（依起始時間，近日優先），點入單一場次做點名。
// 預設顯示「近 30 天內～未來」的未取消場次，方便找到剛結束需補登的場次。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
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
import { formatSessionRange } from "@/lib/admin/datetime";
import type { ActivityStats } from "@/lib/types/database";

type RangeKey = "recent" | "past" | "upcoming" | "all";

export default function AttendanceListPage() {
  const supabase = createClient();
  const toast = useToast();

  const [rows, setRows] = useState<ActivityStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<RangeKey>("recent");

  const load = useCallback(async () => {
    setIsLoading(true);
    const now = new Date();
    let query = supabase
      .from("v_activity_stats")
      .select("*")
      .eq("session_cancelled", false);

    if (range === "recent") {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("start_at", from).lte("start_at", to);
    } else if (range === "past") {
      query = query.lte("end_at", now.toISOString());
    } else if (range === "upcoming") {
      query = query.gte("end_at", now.toISOString());
    }

    const { data, error } = await query.order("start_at", { ascending: false }).limit(300);
    if (error) toast.error(`載入場次失敗：${error.message}`);
    else setRows((data ?? []) as ActivityStats[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((r) => r.title.includes(q));
  }, [rows, search]);

  const nowIso = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="出席簽到"
        description="選擇場次進行點名、代登出席、標記缺席與補登改判。"
      />

      <div className="flex-1 p-4 sm:p-6">
        <Panel padded={false}>
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜尋活動名稱…"
              className="w-56"
            />
            <div className="w-40">
              <Select
                value={range}
                onValueChange={(v) => setRange(v as RangeKey)}
                options={[
                  { value: "recent", label: "近期（前30天～後7天）" },
                  { value: "past", label: "已結束場次" },
                  { value: "upcoming", label: "未結束場次" },
                  { value: "all", label: "全部" },
                ]}
              />
            </div>
            <p className="ml-auto text-xs text-slate-400">共 {filtered.length} 場</p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <Th>時間</Th>
                <Th>活動</Th>
                <Th>狀態</Th>
                <Th className="text-right">已核准</Th>
                <Th className="text-right">出席／缺席／未登</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={6} />
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={6} message="沒有符合條件的場次" />
              ) : (
                filtered.map((s) => {
                  const unmarked = s.approved_count - s.attended_count - s.absent_count;
                  const isEnded = s.end_at <= nowIso;
                  return (
                    <tr key={s.activity_session_id} className="transition-colors hover:bg-slate-50">
                      <Td className="whitespace-nowrap">
                        {formatSessionRange(s.start_at, s.end_at)}
                      </Td>
                      <Td className="font-semibold text-slate-900">{s.title}</Td>
                      <Td>
                        {isEnded ? (
                          <StatusPill meta={{ label: "已結束", badge: "bg-slate-200 text-slate-600" }} />
                        ) : s.start_at <= nowIso ? (
                          <StatusPill meta={{ label: "進行中", badge: "bg-sky-100 text-sky-700" }} />
                        ) : (
                          <StatusPill meta={{ label: "未開始", badge: "bg-emerald-100 text-emerald-700" }} />
                        )}
                      </Td>
                      <Td className="text-right">{s.approved_count}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <span className="text-emerald-600">{s.attended_count}</span>
                        {" / "}
                        <span className="text-slate-700">{s.absent_count}</span>
                        {" / "}
                        <span className={unmarked > 0 && isEnded ? "font-semibold text-amber-600" : "text-slate-400"}>
                          {unmarked}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <Link
                          href={`/admin/attendance/${s.activity_session_id}`}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                        >
                          點名 →
                        </Link>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>
    </>
  );
}
