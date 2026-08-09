// 儀表板＝純工作台：登入即見「今天該處理什麼」。
// 統計圖表依定案規格移至「報表與統計」頁，此處只留待辦與近期場次。

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  EmptyState,
} from "@/components/admin/ui";
import { REGISTRATION_STATUS } from "@/lib/admin/labels";
import {
  formatDateTime,
  formatSessionRange,
  formatTimeRange,
  formatDayHeading,
  taipeiDateKey,
} from "@/lib/admin/datetime";
import type { ActivityStats, RegistrationStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface QueueCard {
  label: string;
  count: number;
  href: string;
  icon: string;
  description: string;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    { count: pendingRegistrations },
    { count: cancelPending },
    { count: overdueCancels },
    { count: pendingAccounts },
    { count: pendingDeactivations },
    { count: blacklistedCount },
    { data: upcomingSessions },
    { data: latestPending },
  ] = await Promise.all([
    supabase
      .from("registrations")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("registrations")
      .select("*", { count: "exact", head: true })
      .eq("status", "cancel_pending"),
    supabase
      .from("v_overdue_cancel_reviews")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("volunteer_profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("deactivation_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("volunteer_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_blacklisted", true),
    supabase
      .from("v_activity_stats")
      .select("*")
      .gte("start_at", now.toISOString())
      .lte("start_at", in7Days.toISOString())
      .eq("session_cancelled", false)
      .order("start_at", { ascending: true })
      .limit(20),
    supabase
      .from("registrations")
      .select(
        "id, status, created_at, volunteer_profiles:volunteer_id(full_name), activity_sessions(start_at, end_at, activities(id, title))"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(8),
  ]);

  const queues: QueueCard[] = [
    {
      label: "待審核報名",
      count: pendingRegistrations ?? 0,
      href: "/admin/registrations",
      icon: "fact_check",
      description: "學生報名等待核准",
    },
    {
      label: "取消審核",
      count: cancelPending ?? 0,
      href: "/admin/registrations?tab=cancel",
      icon: "event_busy",
      description: "取消申請等待審核",
    },
    {
      label: "逾期待辦",
      count: overdueCancels ?? 0,
      href: "/admin/registrations?tab=overdue",
      icon: "assignment_late",
      description: "場次已結束仍未審的取消申請",
    },
    {
      label: "帳號審核",
      count: pendingAccounts ?? 0,
      href: "/admin/volunteer-review",
      icon: "person_check",
      description: "新註冊學生等待審核",
    },
    {
      label: "停用申請",
      count: pendingDeactivations ?? 0,
      href: "/admin/volunteer-review?tab=deactivation",
      icon: "person_remove",
      description: "學生申請停用帳號",
    },
    {
      label: "目前黑名單",
      count: blacklistedCount ?? 0,
      href: "/admin/blacklist",
      icon: "person_off",
      description: "黑名單期間中的學生",
    },
  ];

  const sessions = (upcomingSessions ?? []) as ActivityStats[];

  // 依台灣本地日期分組：日期只在小節標題出現一次，每列就只剩時段，
  // 活動名稱因而能單行放下。資料已按 start_at 遞增，用累加即可保序。
  const sessionDays: { dateKey: string; label: string; rows: ActivityStats[] }[] = [];
  for (const s of sessions) {
    const dateKey = taipeiDateKey(s.start_at);
    const last = sessionDays[sessionDays.length - 1];
    if (last && last.dateKey === dateKey) last.rows.push(s);
    else sessionDays.push({ dateKey, label: formatDayHeading(dateKey), rows: [s] });
  }

  return (
    <>
      <PageHeader
        title="儀表板"

      />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {queues.map((queue) => (
            <Link prefetch={false}
              key={queue.label}
              href={queue.href}
              className={`group rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                queue.count > 0 ? "border-amber-300" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span translate="no" aria-hidden="true"
                  className={`material-symbols-outlined notranslate text-[22px] ${
                    queue.count > 0 ? "text-amber-500" : "text-slate-300"
                  }`}
                >
                  {queue.icon}
                </span>
                <span
                  className={`text-2xl font-bold ${
                    queue.count > 0 ? "text-slate-900" : "text-slate-300"
                  }`}
                >
                  {queue.count}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800 group-hover:text-primary">
                {queue.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{queue.description}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel
            title="未來 7 天場次"
            description="即將開始的活動場次與報名狀況。"
            padded={false}
            action={
              <Link prefetch={false}
                href="/admin/activities"
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                活動管理 →
              </Link>
            }
          >
            {/* 捲動容器與 TableShell 相同，只是內容不是表格 */}
            <div className="min-h-0 flex-1 overflow-auto">
              {sessionDays.length === 0 ? (
                <EmptyState message="未來 7 天沒有場次" />
              ) : (
                sessionDays.map((day) => (
                  <section key={day.dateKey} aria-label={`${day.label}的場次`}>
                    <h3 className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
                      {day.label}
                      <span className="font-medium text-slate-400">{day.rows.length} 場</span>
                    </h3>
                    <ul className="divide-y divide-slate-100">
                      {day.rows.map((s) => {
                        const pending = Math.max(
                          0,
                          s.active_registrations - s.approved_count
                        );
                        const isFull = s.active_registrations >= s.capacity;
                        return (
                          <li
                            key={s.activity_session_id}
                            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50"
                          >
                            {/* min-w 而非固定 w：同日場次一律對齊 6.5rem，
                                跨日字串較長時該列自行撐開，不會壓到活動名稱 */}
                            <span className="min-w-[6.5rem] shrink-0 whitespace-nowrap text-sm text-slate-500">
                              {formatTimeRange(s.start_at, s.end_at)}
                            </span>
                            <Link
                              prefetch={false}
                              href={`/admin/activities/${s.activity_id}`}
                              title={s.title}
                              className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 hover:text-primary"
                            >
                              {s.title}
                            </Link>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {pending > 0 && (
                                <Link
                                  prefetch={false}
                                  href="/admin/registrations"
                                  aria-label={`${s.title}：${pending} 筆報名待審核，前往審核`}
                                  className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-200"
                                >
                                  待審 {pending}
                                </Link>
                              )}
                              <span
                                aria-label={`佔額 ${s.active_registrations} 人，名額 ${s.capacity} 人`}
                                className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  isFull
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {s.active_registrations}／{s.capacity}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </Panel>

          <Panel
            title="最早的待審報名"
            description="等最久的報名申請，優先處理。"
            padded={false}
            action={
              <Link prefetch={false}
                href="/admin/registrations"
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                前往審核 →
              </Link>
            }
          >
            <TableShell>
              <thead>
                <tr>
                  <Th>學生</Th>
                  <Th>活動場次</Th>
                  <Th>申請時間</Th>
                  <Th>狀態</Th>
                </tr>
              </thead>
              <tbody>
                {!latestPending || latestPending.length === 0 ? (
                  <EmptyRow colSpan={4} message="沒有待審核的報名" />
                ) : (
                  latestPending.map((row: any) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <Td className="font-semibold text-slate-900">
                        {row.volunteer_profiles?.full_name ?? "—"}
                      </Td>
                      <Td>
                        <p className="text-slate-800">
                          {row.activity_sessions?.activities?.title ?? "—"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {row.activity_sessions
                            ? formatSessionRange(
                                row.activity_sessions.start_at,
                                row.activity_sessions.end_at
                              )
                            : ""}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(row.created_at)}
                      </Td>
                      <Td>
                        <StatusPill
                          meta={REGISTRATION_STATUS[row.status as RegistrationStatus]}
                        />
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </Panel>
        </div>
      </div>
    </>
  );
}
