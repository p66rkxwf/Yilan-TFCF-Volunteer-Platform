"use client";

// 報名詳情頁：單筆報名的活動與場次資訊、報名狀態摘要，以及「自行簽到」入口。
// 簽到開放時段（場次開始前 N 分鐘～結束）與帳號/報名狀態守衛皆由
// rpc_self_check_in 強制，前端僅依明顯條件決定是否顯示按鈕，錯誤訊息原樣呈現。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { selfCheckIn } from "@/lib/actions/registrations";
import { formatSessionRange } from "@/lib/admin/datetime";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待審核", color: "bg-amber-100 text-amber-700" },
  approved: { label: "已通過", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "未通過", color: "bg-amber-100 text-amber-700" },
  cancel_pending: { label: "取消審核中", color: "bg-amber-100 text-amber-700" },
  cancelled: { label: "已取消", color: "bg-slate-200 text-slate-600" },
  expired: { label: "已過期", color: "bg-slate-200 text-slate-600" },
};

const ATTENDANCE_MAP: Record<string, { label: string; color: string }> = {
  attended: { label: "已出席", color: "bg-emerald-100 text-emerald-700" },
  absent: { label: "缺席", color: "bg-amber-100 text-amber-700" },
  makeup_attended: { label: "已出席（補登）", color: "bg-emerald-100 text-emerald-700" },
};

const DATETIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

interface RegistrationDetail {
  id: string;
  status: string;
  attendance: string | null;
  service_hours: number | null;
  created_at: string;
  checked_in_at: string | null;
  session: {
    id: string;
    start_at: string;
    end_at: string;
    cancelled_at: string | null;
    registration_deadline_at: string;
  } | null;
  activity: {
    id: string;
    title: string;
    content: string | null;
    location: string;
    cancel_review_window_days: number;
  } | null;
}

export default function RegistrationDetailPage() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [reg, setReg] = useState<RegistrationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        "id, status, attendance, service_hours, created_at, checked_in_at, activity_sessions(id, start_at, end_at, cancelled_at, registration_deadline_at, activities(id, title, content, location, cancel_review_window_days))"
      )
      .eq("id", registrationId)
      .maybeSingle();

    if (error || !data) {
      toast.error("找不到這筆報名紀錄");
      router.push("/profile/registrations");
      return;
    }

    const session = (data as any).activity_sessions ?? null;
    setReg({
      id: (data as any).id,
      status: (data as any).status,
      attendance: (data as any).attendance ?? null,
      service_hours:
        (data as any).service_hours == null ? null : Number((data as any).service_hours),
      created_at: (data as any).created_at,
      checked_in_at: (data as any).checked_in_at ?? null,
      session: session
        ? {
            id: session.id,
            start_at: session.start_at,
            end_at: session.end_at,
            cancelled_at: session.cancelled_at ?? null,
            registration_deadline_at: session.registration_deadline_at,
          }
        : null,
      activity: session?.activities ?? null,
    });
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const handleCheckIn = async () => {
    if (isCheckingIn) return;
    setIsCheckingIn(true);
    const result = await selfCheckIn(registrationId);
    if (result.error) {
      toast.error(result.error, "簽到失敗");
    } else {
      toast.success("簽到成功！感謝您的參與。");
      await load();
    }
    setIsCheckingIn(false);
  };

  if (isLoading || !reg) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  const s = STATUS_MAP[reg.status] ?? STATUS_MAP.pending;
  const attendance = reg.attendance ? ATTENDANCE_MAP[reg.attendance] : null;
  const now = new Date().toISOString();
  // 簽到入口的顯示條件（寬鬆版）：已核准、尚無出席紀錄、場次未取消且未結束。
  // 實際開放時段（開始前 N 分鐘）由 RPC 判定，過早按會得到明確的中文提示。
  const canTryCheckIn =
    reg.status === "approved" &&
    !reg.attendance &&
    reg.session &&
    !reg.session.cancelled_at &&
    reg.session.end_at > now;

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8">
      <div className="w-full max-w-3xl space-y-4">
        <Link
          href="/profile/registrations"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-primary"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          返回我的報名
        </Link>

        {/* 標題與狀態 */}
        <div className="rounded-md border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {reg.activity?.title ?? "未知活動"}
            </h1>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${s.color}`}>
              {s.label}
            </span>
            {attendance && (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${attendance.color}`}
              >
                {attendance.label}
              </span>
            )}
          </div>

          {/* 活動與場次資訊 */}
          <div className="mt-4 space-y-2.5 text-base text-slate-700">
            {reg.session && (
              <p className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-slate-400">
                  calendar_today
                </span>
                <span>
                  <span className="font-medium text-slate-500">場次時間：</span>
                  {formatSessionRange(reg.session.start_at, reg.session.end_at)}
                  {reg.session.cancelled_at ? "（此場次已取消）" : ""}
                </span>
              </p>
            )}
            {reg.activity?.location && (
              <p className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-slate-400">
                  location_on
                </span>
                <span>
                  <span className="font-medium text-slate-500">地點：</span>
                  {reg.activity.location}
                </span>
              </p>
            )}
            <p className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-slate-400">schedule</span>
              <span>
                <span className="font-medium text-slate-500">報名時間：</span>
                {DATETIME_FORMATTER.format(new Date(reg.created_at))}
              </span>
            </p>
            {reg.checked_in_at && (
              <p className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-slate-400">
                  how_to_reg
                </span>
                <span>
                  <span className="font-medium text-slate-500">簽到時間：</span>
                  {DATETIME_FORMATTER.format(new Date(reg.checked_in_at))}
                </span>
              </p>
            )}
            {(reg.attendance === "attended" || reg.attendance === "makeup_attended") &&
              reg.service_hours != null && (
                <p className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">timer</span>
                  <span className="font-semibold text-primary">
                    服務時數：{reg.service_hours} 小時
                  </span>
                </p>
              )}
          </div>

          {reg.activity?.content && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-1.5 text-sm font-medium text-slate-500">活動說明</p>
              <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                {reg.activity.content}
              </p>
            </div>
          )}

          {reg.activity && (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              取消規則：
              {reg.activity.cancel_review_window_days === 0
                ? "任何時候取消皆需審核。"
                : `場次開始前 ${reg.activity.cancel_review_window_days} 天內取消需經審核。`}
            </p>
          )}

          {reg.activity && (
            <Link
              href={`/volunteer/${reg.activity.id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              查看活動頁面
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          )}
        </div>

        {/* 自行簽到 */}
        {canTryCheckIn && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">活動當天自行簽到</p>
                <p className="mt-1 text-xs text-slate-500">
                  開放時間為場次開始前（依系統設定的分鐘數）至場次結束；不在開放時段按下會提示尚未開放。
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={isCheckingIn}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                {isCheckingIn ? "簽到中…" : "立即簽到"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
