"use client";

// 操作紀錄（僅系統管理員可讀，RLS 強制）：誰、何時、對誰、做了什麼。
// 點列（或點操作名稱）開詳情對話框，看完整 detail 與完整 uuid。
//
// 篩選一律下到資料庫端，不在前端過濾已抓回的 1000 筆：稽核查帳最怕「篩不到就
// 以為沒發生」，而超出上限沒被抓回來的那些，前端篩選永遠看不到。

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../admin-context";
import {
  PageHeader,
  Panel,
  TableShell,
  Td,
  EmptyRow,
  LoadingRow,
  Toolbar,
  Field,
  SortableTh,
  TimeCell,
  rowOpen,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTOR_KIND_LABELS,
  AUDIT_TARGET_LABELS,
} from "@/lib/admin/labels";
import {
  auditDetailEntries,
  auditTargetName,
  summarizeAuditDetail,
  type AuditDetail,
} from "@/lib/admin/audit";
import { formatDateTime, todayTaipeiDate } from "@/lib/admin/datetime";
import { byIso, byText, useTableSort } from "@/components/admin/use-table-sort";

const ROW_LIMIT = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LogRow {
  id: string;
  created_at: string;
  action: string;
  target_table: string;
  target_id: string;
  actor_id: string | null;
  actor_kind: string | null;
  detail: AuditDetail;
  actorName: string | null;
}

// 操作／對象／身分欄排的是畫面上的中文標籤：這幾個不是狀態機，只是一組平行的
// 詞彙，沒有「先後」可言，依畫面文字排才對得上使用者看到的東西。
const SORTS = {
  time: byIso<LogRow>((r) => r.created_at),
  action: byText<LogRow>((r) => AUDIT_ACTION_LABELS[r.action] ?? r.action),
  target: byText<LogRow>(
    (r) =>
      `${AUDIT_TARGET_LABELS[r.target_table] ?? r.target_table}${auditTargetName(r.detail) ?? ""}`
  ),
  summary: byText<LogRow>((r) => summarizeAuditDetail(r.action, r.detail)),
  actor: byText<LogRow>((r) => r.actorName),
  actorKind: byText<LogRow>(
    (r) => AUDIT_ACTOR_KIND_LABELS[r.actor_kind ?? "system"] ?? ""
  ),
};

// 操作類型下拉：大類（g:key）＋大類底下的單項，以縮排區分層級
const ACTION_OPTIONS = [
  { value: "all", label: "全部操作" },
  ...AUDIT_ACTION_GROUPS.flatMap((group) => [
    { value: `g:${group.key}`, label: `${group.label}（全部）` },
    ...group.actions.map((action) => ({
      value: action,
      label: `　${AUDIT_ACTION_LABELS[action] ?? action}`,
    })),
  ]),
];

const TARGET_OPTIONS = [
  { value: "all", label: "全部對象" },
  ...Object.entries(AUDIT_TARGET_LABELS).map(([value, label]) => ({ value, label })),
];

const ACTOR_KIND_OPTIONS = [
  { value: "all", label: "全部身分" },
  ...Object.entries(AUDIT_ACTOR_KIND_LABELS).map(([value, label]) => ({ value, label })),
];

export default function LogsPage() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const profile = useAdminProfile();

  const { sort, toggle, sortRows } = useTableSort<LogRow>(SORTS);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(todayTaipeiDate(-7));
  const [dateTo, setDateTo] = useState(todayTaipeiDate(0));
  const [actionFilter, setActionFilter] = useState("all");
  const [actorKindFilter, setActorKindFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  // 關鍵字要打到資料庫，故不隨每次按鍵重查；按 Enter／查詢才套用
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [detailTarget, setDetailTarget] = useState<LogRow | null>(null);

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

    let query = supabase
      .from("audit_logs")
      .select(
        "id, created_at, action, target_table, target_id, actor_id, actor_kind, detail"
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso);

    if (actionFilter !== "all") {
      if (actionFilter.startsWith("g:")) {
        const group = AUDIT_ACTION_GROUPS.find((g) => g.key === actionFilter.slice(2));
        if (group) query = query.in("action", group.actions);
      } else {
        query = query.eq("action", actionFilter);
      }
    }
    if (actorKindFilter !== "all") query = query.eq("actor_kind", actorKindFilter);
    if (targetFilter !== "all") query = query.eq("target_table", targetFilter);

    // PostgREST 的 or=() 以逗號分隔、以括號分組，值裡出現這些字元會把語法切斷，
    // 故先去掉。使用者搜姓名／標題用不到它們。
    const kw = keyword.trim().replace(/[,()"\\*]/g, "");
    if (kw) {
      // 使用者打的是中文（「核准報名」），DB 存的是英文 action，先在標籤表上比對
      const actionKeys = Object.entries(AUDIT_ACTION_LABELS)
        .filter(([, label]) => label.includes(kw))
        .map(([key]) => key);

      // 操作人姓名同樣要先換成 id 才能下條件（職員與學生都可能是操作人）
      const [staffRes, volunteerRes] = await Promise.all([
        supabase.from("staff_profiles").select("id").ilike("full_name", `%${kw}%`).limit(200),
        supabase.from("volunteer_profiles").select("id").ilike("full_name", `%${kw}%`).limit(200),
      ]);
      const actorIds = [
        ...((staffRes.data ?? []) as { id: string }[]),
        ...((volunteerRes.data ?? []) as { id: string }[]),
      ].map((r) => r.id);

      const ors: string[] = [];
      if (actionKeys.length > 0) ors.push(`action.in.(${actionKeys.join(",")})`);
      if (actorIds.length > 0) ors.push(`actor_id.in.(${actorIds.join(",")})`);
      if (UUID_RE.test(kw)) ors.push(`target_id.eq.${kw}`);
      // detail 是無固定 schema 的 jsonb，逐個常見文字鍵比對（整包轉 text 搜尋
      // 在 PostgREST 沒得表達，需要 DB 函式；目前這些鍵已涵蓋人名與標題）
      for (const key of ["name", "title", "full_name", "reason"]) {
        ors.push(`detail->>${key}.ilike.*${kw}*`);
      }
      query = query.or(ors.join(","));
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);

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
  }, [dateFrom, dateTo, actionFilter, actorKindFilter, targetFilter, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilter =
    actionFilter !== "all" ||
    actorKindFilter !== "all" ||
    targetFilter !== "all" ||
    keyword.trim() !== "";

  const resetFilters = () => {
    setActionFilter("all");
    setActorKindFilter("all");
    setTargetFilter("all");
    setKeywordInput("");
    setKeyword("");
  };

  return (
    <>
      <PageHeader title="操作紀錄" />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <Panel padded={false} fill>
          <Toolbar>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="起始日期">
                <DatePicker value={dateFrom} onChange={setDateFrom} className="w-40" />
              </Field>
              <Field label="結束日期">
                <DatePicker value={dateTo} onChange={setDateTo} className="w-40" />
              </Field>
              <Field label="操作類型">
                <div className="w-52">
                  <Select
                    value={actionFilter}
                    onValueChange={setActionFilter}
                    options={ACTION_OPTIONS}
                    ariaLabel="依操作類型篩選"
                  />
                </div>
              </Field>
              <Field label="身分">
                <div className="w-32">
                  <Select
                    value={actorKindFilter}
                    onValueChange={setActorKindFilter}
                    options={ACTOR_KIND_OPTIONS}
                    ariaLabel="依操作者身分篩選"
                  />
                </div>
              </Field>
              <Field label="對象類別">
                <div className="w-36">
                  <Select
                    value={targetFilter}
                    onValueChange={setTargetFilter}
                    options={TARGET_OPTIONS}
                    ariaLabel="依對象類別篩選"
                  />
                </div>
              </Field>
              <Field label="關鍵字">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setKeyword(keywordInput);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="search"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="操作人、操作名稱、對象名稱…"
                    aria-label="搜尋操作紀錄"
                    className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <Button size="sm" variant="outline" type="submit">
                    查詢
                  </Button>
                </form>
              </Field>
              {hasFilter && (
                <Button size="sm" variant="ghost" onClick={resetFilters}>
                  清除篩選
                </Button>
              )}
            </div>
            <p className="ml-auto self-end text-xs text-slate-400">
              共 {rows.length} 筆{rows.length >= ROW_LIMIT ? `（已達上限 ${ROW_LIMIT}，請縮小範圍）` : ""}
            </p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <SortableTh sortKey="time" sort={sort} onToggle={toggle}>時間</SortableTh>
                <SortableTh sortKey="action" sort={sort} onToggle={toggle}>操作</SortableTh>
                <SortableTh sortKey="target" sort={sort} onToggle={toggle}>對象</SortableTh>
                <SortableTh sortKey="summary" sort={sort} onToggle={toggle}>說明</SortableTh>
                <SortableTh sortKey="actor" sort={sort} onToggle={toggle}>操作人</SortableTh>
                <SortableTh sortKey="actorKind" sort={sort} onToggle={toggle}>身分</SortableTh>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={6} />
              ) : rows.length === 0 ? (
                <EmptyRow
                  colSpan={6}
                  message={hasFilter ? "沒有符合條件的操作紀錄" : "此區間沒有操作紀錄"}
                />
              ) : (
                sortRows(rows).map((row) => {
                  const targetName = auditTargetName(row.detail);
                  const summary = summarizeAuditDetail(row.action, row.detail);
                  return (
                    <tr
                      key={row.id}
                      {...rowOpen(() => setDetailTarget(row))}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <Td className="whitespace-nowrap text-slate-500">
                        <TimeCell iso={row.created_at} />
                      </Td>
                      <Td className="font-medium text-slate-800">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(row)}
                          className="text-left hover:text-primary"
                        >
                          {AUDIT_ACTION_LABELS[row.action] ?? row.action}
                        </button>
                      </Td>
                      <Td className="text-slate-500">
                        <span className="block whitespace-nowrap text-slate-700">
                          {AUDIT_TARGET_LABELS[row.target_table] ?? row.target_table}
                        </span>
                        {targetName ? (
                          <span className="block max-w-40 truncate text-xs text-slate-500">
                            {targetName}
                          </span>
                        ) : (
                          <span className="block font-mono text-xs text-slate-400">
                            {row.target_id.slice(0, 8)}
                          </span>
                        )}
                      </Td>
                      <Td className="text-slate-500">
                        <span className="block max-w-80 truncate" title={summary}>
                          {summary || "—"}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {row.actorName ?? (row.actor_kind === "volunteer" ? "（已移除的學生）" : "系統自動")}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {AUDIT_ACTOR_KIND_LABELS[row.actor_kind ?? "system"] ?? "—"}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <Modal
        open={detailTarget !== null}
        title={
          detailTarget
            ? AUDIT_ACTION_LABELS[detailTarget.action] ?? detailTarget.action
            : ""
        }
        description={detailTarget ? formatDateTime(detailTarget.created_at) : undefined}
        onClose={() => setDetailTarget(null)}
      >
        {detailTarget && (
          <dl className="space-y-3 text-sm">
            <DetailRow label="操作代號">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                {detailTarget.action}
              </code>
            </DetailRow>
            <DetailRow label="對象">
              {AUDIT_TARGET_LABELS[detailTarget.target_table] ?? detailTarget.target_table}
              {auditTargetName(detailTarget.detail) && (
                <span className="ml-1">「{auditTargetName(detailTarget.detail)}」</span>
              )}
              <span className="mt-0.5 block break-all font-mono text-xs text-slate-400">
                {detailTarget.target_table} · {detailTarget.target_id}
              </span>
            </DetailRow>
            <DetailRow label="操作人">
              {detailTarget.actorName ??
                (detailTarget.actor_kind === "volunteer" ? "（已移除的學生）" : "系統自動")}
              <span className="ml-1 text-xs text-slate-400">
                （{AUDIT_ACTOR_KIND_LABELS[detailTarget.actor_kind ?? "system"] ?? "—"}）
              </span>
              {detailTarget.actor_id && (
                <span className="mt-0.5 block break-all font-mono text-xs text-slate-400">
                  {detailTarget.actor_id}
                </span>
              )}
            </DetailRow>

            {auditDetailEntries(detailTarget.action, detailTarget.detail).length > 0 ? (
              <>
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-bold text-slate-500">詳細內容</p>
                  <dl className="space-y-2">
                    {auditDetailEntries(detailTarget.action, detailTarget.detail).map((entry) => (
                      <DetailRow key={entry.label} label={entry.label}>
                        <span className="break-words">{entry.value}</span>
                      </DetailRow>
                    ))}
                  </dl>
                </div>
                {/* 上面只翻譯認得的鍵；原始 JSON 保底，確保查帳時什麼都不會被藏起來 */}
                <details className="border-t border-slate-100 pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600">
                    原始資料（JSON）
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">
                    {JSON.stringify(detailTarget.detail, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
                這筆操作沒有額外記錄的細節。
              </p>
            )}
          </dl>
        )}
      </Modal>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-slate-500 sm:w-24">{label}</dt>
      <dd className="min-w-0 flex-1 text-slate-800">{children}</dd>
    </div>
  );
}
