"use client";

// 活動詳情：基本資料、狀態操作、主辦人、場次清單（含各場報名統計與操作）。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  DescriptionItem,
  RowActionMenu,
} from "@/components/admin/ui";
import { ACTIVITY_STATUS, ACTIVITY_TYPE } from "@/lib/admin/labels";
import { formatDateTime, formatSessionRange, sessionHours } from "@/lib/admin/datetime";
import type { Activity, ActivitySession, ActivityStats } from "@/lib/types/database";

interface OrganizerRow {
  staff_id: string;
  staff: { full_name: string; phone: string } | null;
}

type ConfirmAction =
  | { kind: "publish" }
  | { kind: "close" }
  | { kind: "cancelActivity" }
  | { kind: "deleteDraft" }
  | { kind: "cancelSession"; sessionId: string; label: string };

export default function ActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [activity, setActivity] = useState<(Activity & { creator: { full_name: string } | null }) | null>(null);
  const [organizers, setOrganizers] = useState<OrganizerRow[]>([]);
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [stats, setStats] = useState<Map<string, ActivityStats>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [isActing, setIsActing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [activityRes, organizersRes, sessionsRes, statsRes] = await Promise.all([
      supabase
        .from("activities")
        .select("*, creator:created_by(full_name)")
        .eq("id", activityId)
        .maybeSingle(),
      supabase
        .from("activity_organizers")
        .select("staff_id, staff:staff_id(full_name, phone)")
        .eq("activity_id", activityId),
      supabase
        .from("activity_sessions")
        .select("*")
        .eq("activity_id", activityId)
        .order("start_at"),
      supabase.from("v_activity_stats").select("*").eq("activity_id", activityId),
    ]);

    if (activityRes.error || !activityRes.data) {
      toast.error("找不到此活動");
      router.push("/admin/activities");
      return;
    }
    setActivity(activityRes.data as any);
    setOrganizers((organizersRes.data ?? []) as unknown as OrganizerRow[]);
    setSessions((sessionsRes.data ?? []) as ActivitySession[]);
    setStats(
      new Map(
        ((statsRes.data ?? []) as ActivityStats[]).map((s) => [s.activity_session_id, s])
      )
    );
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  // 全體在職職員皆可管理活動（能進到後台即為在職職員）。RLS/RPC 端由
  // fn_can_manage_activity（supabase/v2/09_relax_activity_management.sql）同步放寬。
  const canManage = Boolean(activity);
  // 發布需至少一個有效（未取消）場次；無有效場次時不提供發布入口，
  // 避免彈出確認框後才被後端擋（DB trigger 仍為最終防線）。
  const hasPublishableSession = sessions.some((s) => !s.cancelled_at);

  const handleConfirm = async () => {
    if (!confirm || !activity) return;
    setIsActing(true);
    try {
      if (confirm.kind === "publish") {
        const { error } = await supabase
          .from("activities")
          .update({ status: "open" })
          .eq("id", activity.id);
        if (error) throw error;
        toast.success("活動已發布，開放報名");
      } else if (confirm.kind === "close") {
        const { error } = await supabase
          .from("activities")
          .update({ status: "closed" })
          .eq("id", activity.id);
        if (error) throw error;
        toast.success("活動已提前截止報名");
      } else if (confirm.kind === "cancelActivity") {
        const { data, error } = await supabase.rpc("rpc_cancel_activity", {
          p_activity_id: activity.id,
        });
        if (error) throw error;
        toast.success(`活動已取消，連動取消 ${data ?? 0} 筆報名並通知學生`);
      } else if (confirm.kind === "deleteDraft") {
        const { error } = await supabase.from("activities").delete().eq("id", activity.id);
        if (error) throw error;
        toast.success("草稿已刪除");
        router.push("/admin/activities");
        return;
      } else if (confirm.kind === "cancelSession") {
        const { data, error } = await supabase.rpc("rpc_cancel_session", {
          p_session_id: confirm.sessionId,
        });
        if (error) throw error;
        toast.success(`場次已取消，連動取消 ${data ?? 0} 筆報名並通知學生`);
      }
      setConfirm(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading || !activity) {
    return (
      <>
        <PageHeader title="活動詳情" backHref="/admin/activities" backLabel="活動管理" />
        <div className="p-6 text-sm text-slate-400">資料載入中…</div>
      </>
    );
  }

  const meta = ACTIVITY_STATUS[activity.status];
  const nowIso = new Date().toISOString();

  const confirmTexts: Record<ConfirmAction["kind"], { title: string; description: string; danger?: boolean }> = {
    publish: {
      title: "發布活動？",
      description: "發布後學生即可看到並報名此活動的場次。",
    },
    close: {
      title: "提前截止報名？",
      description: "所有場次將停止接受新報名（已送出的報名不受影響，仍可審核）。",
    },
    cancelActivity: {
      title: "取消整場活動？",
      description:
        "所有尚未開始的場次會標記取消，其有效報名（含待審核）將全部連動取消並逐筆通知學生；已結束場次的出席紀錄保留。此操作不可復原。",
      danger: true,
    },
    deleteDraft: {
      title: "刪除草稿？",
      description: "僅草稿可刪除；場次會一併刪除。此操作不可復原。",
      danger: true,
    },
    cancelSession: {
      title: "取消此場次？",
      description:
        "該場所有有效報名將連動取消並逐筆通知學生（颱風停辦等情況）。已結束的場次不可取消。此操作不可復原。",
      danger: true,
    },
  };

  return (
    <>
      <PageHeader
        title={activity.title}
        backHref="/admin/activities"
        backLabel="活動管理"
        actions={
          canManage ? (
            <RowActionMenu
              triggerLabel="操作"
              ariaLabel={`${activity.title} 的操作`}
              actions={[
                activity.status === "draft" && hasPublishableSession && {
                  label: "發布活動",
                  icon: "publish",
                  onSelect: () => setConfirm({ kind: "publish" }),
                },
                ["draft", "open", "closed"].includes(activity.status) && {
                  label: "編輯活動",
                  icon: "edit",
                  href: `/admin/activities/${activity.id}/edit`,
                },
                activity.status === "open" && {
                  label: "提前截止",
                  icon: "event_busy",
                  onSelect: () => setConfirm({ kind: "close" }),
                },
                ["open", "closed"].includes(activity.status) && {
                  label: "取消活動",
                  icon: "cancel",
                  danger: true,
                  onSelect: () => setConfirm({ kind: "cancelActivity" }),
                },
                activity.status === "draft" && {
                  label: "刪除草稿",
                  icon: "delete_forever",
                  danger: true,
                  onSelect: () => setConfirm({ kind: "deleteDraft" }),
                },
              ]}
            />
          ) : undefined
        }
      />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="基本資料">
            <dl className="space-y-3">
              <DescriptionItem label="狀態">
                <StatusPill meta={meta} />
              </DescriptionItem>
              <DescriptionItem label="類型">{ACTIVITY_TYPE[activity.activity_type]}</DescriptionItem>
              <DescriptionItem label="地點">{activity.location}</DescriptionItem>
              <DescriptionItem label="取消審核門檻">
                {activity.cancel_review_window_days === 0
                  ? "任何時候取消都需審核（N=0）"
                  : `場次開始前 ${activity.cancel_review_window_days} 天內取消需審核`}
              </DescriptionItem>
              <DescriptionItem label="建立者">
                {activity.creator?.full_name ?? "—"}（{formatDateTime(activity.created_at)}）
              </DescriptionItem>
              <DescriptionItem label="活動說明">
                {activity.content ? (
                  <span className="whitespace-pre-wrap">{activity.content}</span>
                ) : (
                  <span className="text-slate-400">（未填寫）</span>
                )}
              </DescriptionItem>
            </dl>
          </Panel>

          <Panel
            title="主辦人"

          >
            {organizers.length === 0 ? (
              <p className="text-sm text-slate-400">尚未指定主辦人（編輯活動以加入）</p>
            ) : (
              <ul className="space-y-2">
                {organizers.map((o) => (
                  <li
                    key={o.staff_id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      {o.staff?.full_name ?? "（已停權職員）"}
                    </span>
                    <span className="text-xs text-slate-500">{o.staff?.phone ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="場次"

          padded={false}
          action={
            canManage && ["draft", "open", "closed"].includes(activity.status) ? (
              <Link
                href={`/admin/activities/${activity.id}/sessions/new`}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                新增場次
              </Link>
            ) : undefined
          }
        >
          <TableShell>
            <thead>
              <tr>
                <Th>時間</Th>
                <Th>報名截止</Th>
                <Th className="text-right">時數</Th>
                <Th className="text-right">佔額／名額</Th>
                <Th className="text-right">已核准</Th>
                <Th className="text-right">出席／缺席</Th>
                <Th>狀態</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <EmptyRow colSpan={8} message="尚未建立場次；至少需一個場次才能發布活動" />
              ) : (
                sessions.map((session) => {
                  const stat = stats.get(session.id);
                  const isCancelled = Boolean(session.cancelled_at);
                  const isEnded = session.end_at <= nowIso;
                  return (
                    <tr key={session.id} className="transition-colors hover:bg-slate-50">
                      <Td className="whitespace-nowrap">
                        {formatSessionRange(session.start_at, session.end_at)}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(session.registration_deadline_at)}
                      </Td>
                      <Td className="text-right">{sessionHours(session.start_at, session.end_at)}</Td>
                      <Td className="text-right">
                        {stat ? `${stat.active_registrations}／${session.capacity}` : `—／${session.capacity}`}
                      </Td>
                      <Td className="text-right">{stat?.approved_count ?? 0}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {stat ? `${stat.attended_count}／${stat.absent_count}` : "0／0"}
                      </Td>
                      <Td>
                        {isCancelled ? (
                          <StatusPill meta={{ label: "已取消", badge: "bg-slate-200 text-slate-600" }} />
                        ) : isEnded ? (
                          <StatusPill meta={{ label: "已結束", badge: "bg-slate-200 text-slate-600" }} />
                        ) : session.registration_deadline_at <= nowIso ? (
                          <StatusPill meta={{ label: "已截止", badge: "bg-amber-100 text-amber-700" }} />
                        ) : (
                          <StatusPill meta={{ label: "可報名", badge: "bg-emerald-100 text-emerald-700" }} />
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-right">
                        <RowActionMenu
                          ariaLabel="場次操作"
                          actions={[
                            {
                              label: "名單/點名",
                              icon: "fact_check",
                              href: `/admin/attendance/${session.id}`,
                            },
                            canManage &&
                              !isCancelled &&
                              !isEnded && {
                                label: "指派學生",
                                icon: "person_add",
                                href: `/admin/activities/${activity.id}/sessions/${session.id}/assign`,
                              },
                            canManage &&
                              !isCancelled && {
                                label: "編輯",
                                icon: "edit",
                                href: `/admin/activities/${activity.id}/sessions/${session.id}/edit`,
                              },
                            canManage &&
                              !isCancelled &&
                              !isEnded && {
                                label: "取消場次",
                                icon: "event_busy",
                                danger: true,
                                onSelect: () =>
                                  setConfirm({
                                    kind: "cancelSession",
                                    sessionId: session.id,
                                    label: formatSessionRange(session.start_at, session.end_at),
                                  }),
                              },
                          ]}
                        />
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? confirmTexts[confirm.kind].title : ""}
        description={confirm ? confirmTexts[confirm.kind].description : undefined}
        isConfirmDanger={confirm ? Boolean(confirmTexts[confirm.kind].danger) : false}
        isLoading={isActing}
        onConfirm={handleConfirm}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
