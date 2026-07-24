"use client";

// 活動詳情＋逐場次報名：列出該活動所有未取消場次，每場各自報名。
// 志工可報多個場次；報名走既有 registerForSession(sessionId) RPC。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { registerForSession } from "@/lib/actions/registrations";
import { Markdown } from "@/components/admin/markdown";
import { formatSessionRange } from "@/lib/admin/datetime";
import type { SessionType, VolunteerStatus } from "@/lib/types/database";

interface SessionRow {
  id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  registration_deadline_at: string;
  cancelled_at: string | null;
  session_type: SessionType;
  location: string | null;
  note: string | null;
}

interface ActivityDetail {
  id: string;
  title: string;
  content: string | null;
  location: string;
  status: string;
  cancel_review_window_days: number;
}

const REG_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "審核中", className: "bg-amber-100 text-amber-700" },
  approved: { label: "已通過", className: "bg-emerald-100 text-emerald-700" },
  cancel_pending: { label: "取消審核中", className: "bg-orange-100 text-orange-700" },
};

const DEADLINE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

export default function VolunteerActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [openBySession, setOpenBySession] = useState<Map<string, number>>(new Map());
  const [regBySession, setRegBySession] = useState<Map<string, string>>(new Map());
  const [organizers, setOrganizers] = useState<{ full_name: string; phone: string }[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [volunteerStatus, setVolunteerStatus] = useState<VolunteerStatus | null>(null);
  const [emailVerified, setEmailVerified] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actingSessionId, setActingSessionId] = useState<string | null>(null);
  const [favPending, setFavPending] = useState(false);

  const accountActive = volunteerStatus === "active";

  const load = useCallback(async () => {
    const [activityRes, sessionsRes, slotsRes, organizerRes] = await Promise.all([
      supabase
        .from("activities")
        .select("id, title, content, location, status, cancel_review_window_days")
        .eq("id", activityId)
        .neq("status", "draft")
        .maybeSingle(),
      supabase
        .from("activity_sessions")
        .select(
          "id, start_at, end_at, capacity, registration_deadline_at, cancelled_at, session_type, location, note"
        )
        .eq("activity_id", activityId)
        .order("start_at"),
      supabase.from("v_session_open_slots").select("activity_session_id, open_slots"),
      supabase
        .from("v_organizer_contacts")
        .select("full_name, phone")
        .eq("activity_id", activityId),
    ]);

    if (activityRes.error || !activityRes.data) {
      toast.error("找不到此活動");
      router.push("/volunteer");
      return;
    }

    setActivity(activityRes.data as ActivityDetail);
    const sess = (sessionsRes.data ?? []) as SessionRow[];
    setSessions(sess);
    setOpenBySession(
      new Map((slotsRes.data ?? []).map((s: any) => [s.activity_session_id, s.open_slots]))
    );
    setOrganizers((organizerRes.data as any) ?? []);

    if (user) {
      const sessionIds = sess.map((s) => s.id);
      const [{ data: regs }, { data: fav }] = await Promise.all([
        sessionIds.length > 0
          ? supabase
              .from("registrations")
              .select("activity_session_id, status")
              .eq("volunteer_id", user.id)
              .in("activity_session_id", sessionIds)
              .in("status", ["pending", "approved", "cancel_pending"])
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("favorites")
          .select("id")
          .eq("volunteer_id", user.id)
          .eq("activity_id", activityId)
          .maybeSingle(),
      ]);
      setRegBySession(
        new Map((regs ?? []).map((r: any) => [r.activity_session_id, r.status]))
      );
      setIsFavorite(!!fav);

      const { data: vp } = await supabase
        .from("volunteer_profiles")
        .select("status, email_verified_at")
        .eq("id", user.id)
        .maybeSingle();
      setVolunteerStatus(vp?.status ?? null);
      setEmailVerified(!!vp?.email_verified_at);
    }

    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [load, authLoading]);

  const handleRegister = async (sessionId: string) => {
    setActingSessionId(sessionId);
    const { error } = await registerForSession(sessionId);
    if (error) {
      toast.error(error);
    } else {
      toast.success("報名成功！請等待審核。");
      await load();
    }
    setActingSessionId(null);
  };

  const handleToggleFavorite = async () => {
    if (!user || favPending) return;
    setFavPending(true);
    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("volunteer_id", user.id)
          .eq("activity_id", activityId);
        if (error) return void toast.error(`取消收藏失敗：${error.message}`);
        setIsFavorite(false);
        toast.success("已取消收藏");
      } else {
        const { error } = await supabase
          .from("favorites")
          .upsert(
            { volunteer_id: user.id, activity_id: activityId },
            { onConflict: "volunteer_id,activity_id", ignoreDuplicates: true }
          );
        if (error) return void toast.error(`收藏失敗：${error.message}`);
        setIsFavorite(true);
        toast.success("已加入收藏");
      }
    } finally {
      setFavPending(false);
    }
  };

  if (isLoading || !activity) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <span aria-hidden="true" className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  const activityOpen = activity.status === "open";
  const nowIso = new Date().toISOString();
  const regularSessions = sessions.filter((s) => s.session_type === "regular");
  const briefings = sessions.filter((s) => s.session_type === "briefing" && !s.cancelled_at);

  return (
    <main className="w-full flex-1 bg-white">
      <div className="w-full px-4 py-6 sm:px-6">
      <Link
        href="/volunteer"
        className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-primary"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
        返回活動列表
      </Link>

      <div className="rounded-md border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {activity.title}
          </h1>
          {user && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              disabled={favPending || !accountActive}
              aria-pressed={isFavorite}
              title={accountActive ? (isFavorite ? "取消收藏" : "加入收藏") : "審核通過後才能收藏"}
              className={`shrink-0 rounded-md p-2 transition-colors ${
                isFavorite ? "text-primary hover:text-primary/80" : "text-slate-300 hover:text-primary/60"
              } ${!accountActive ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span aria-hidden="true"
                className="material-symbols-outlined text-[24px]"
                style={{ fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}
              >
                favorite
              </span>
            </button>
          )}
        </div>

        <div className="mt-4 space-y-2.5 text-base text-slate-700">
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-slate-400">location_on</span>
            <span>
              <span className="font-medium text-slate-500">地點：</span>
              {activity.location}
            </span>
          </p>
          {organizers.length > 0 && (
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
              <span className="flex items-center gap-2 pt-1">
                <span
                  className="material-symbols-outlined text-[20px] text-slate-400"
                  aria-hidden="true"
                >
                  person
                </span>
                <span className="font-medium text-slate-500">負責人：</span>
              </span>
              <ul className="flex flex-wrap gap-2">
                {organizers.map((org, i) => (
                  <li
                    key={i}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm"
                  >
                    <span className="font-semibold text-slate-800">{org.full_name}</span>
                    {org.phone && (
                      <a
                        href={`tel:${org.phone}`}
                        className="inline-flex items-center gap-0.5 text-slate-500 hover:text-primary"
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          aria-hidden="true"
                        >
                          call
                        </span>
                        {org.phone}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {activity.content && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-1.5 text-sm font-medium text-slate-500">活動說明</p>
            <Markdown content={activity.content} />
          </div>
        )}

        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          取消規則：
          {activity.cancel_review_window_days === 0
            ? "任何時候取消皆需審核。"
            : `場次開始前 ${activity.cancel_review_window_days} 天內取消需經審核。`}
        </p>
      </div>

      {briefings.length > 0 && (
        <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-5 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
              campaign
            </span>
            行前說明會
          </h2>
          <ul className="space-y-3">
            {briefings.map((b) => (
              <li key={b.id} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {formatSessionRange(b.start_at, b.end_at)}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <span
                    className="material-symbols-outlined text-[16px] text-slate-400"
                    aria-hidden="true"
                  >
                    location_on
                  </span>
                  {b.location ?? activity.location}
                </p>
                {b.note && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{b.note}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">行前說明會為活動說明場次，無需報名。</p>
        </div>
      )}

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="mb-3 border-b border-slate-200 pb-2 text-base font-bold text-slate-900">
          可報名場次
        </h2>

        {!accountActive && volunteerStatus && (
          <div className="mb-3 rounded-md bg-slate-100 px-4 py-2.5 text-sm text-slate-600">
            目前帳號狀態無法報名，僅供瀏覽。
          </div>
        )}

        {accountActive && !emailVerified && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            <span>報名前需先完成 Email 驗證。</span>
            <Link
              href="/profile/verify-email"
              className="shrink-0 font-semibold text-amber-800 underline hover:text-amber-900"
            >
              前往驗證
            </Link>
          </div>
        )}

        {regularSessions.filter((s) => !s.cancelled_at).length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            此活動尚未開放任何場次。
          </div>
        ) : (
          <div className="border-t border-slate-100">
            <ul className="divide-y divide-slate-100">
              {regularSessions.map((s) => {
                const activeReg = regBySession.get(s.id);
                const openSlots = openBySession.get(s.id) ?? s.capacity;
                const cancelled = !!s.cancelled_at;
                const ended = s.end_at <= nowIso;
                const pastDeadline = s.registration_deadline_at <= nowIso;
                const full = openSlots <= 0;
                const canRegister =
                  accountActive && emailVerified && activityOpen && !cancelled && !ended && !pastDeadline && !full && !activeReg;

                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatSessionRange(s.start_at, s.end_at)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        報名截止 {DEADLINE_FORMATTER.format(new Date(s.registration_deadline_at))}
                        {!cancelled && !ended && ` · 尚餘 ${Math.max(openSlots, 0)}／${s.capacity} 名`}
                      </p>
                      {s.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <span
                            className="material-symbols-outlined text-[14px] text-slate-400"
                            aria-hidden="true"
                          >
                            location_on
                          </span>
                          {s.location}
                        </p>
                      )}
                    </div>

                    {activeReg ? (
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          REG_STATUS[activeReg]?.className ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {REG_STATUS[activeReg]?.label ?? "已報名"}
                      </span>
                    ) : cancelled ? (
                      <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">
                        已取消
                      </span>
                    ) : ended ? (
                      <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-500">
                        已結束
                      </span>
                    ) : pastDeadline ? (
                      <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-500">
                        已截止
                      </span>
                    ) : full ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                        已額滿
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRegister(s.id)}
                        disabled={!canRegister || actingSessionId === s.id}
                        className="shrink-0 rounded-md bg-primary px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                      >
                        {actingSessionId === s.id ? "報名中…" : accountActive ? "報名" : "無法報名"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
