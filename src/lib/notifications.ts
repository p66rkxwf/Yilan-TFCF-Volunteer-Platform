// 站內通知的顯示文案與導向連結（通知中心用）。
// 標題／內文自 workers/orchestrator/src/index.ts 的 SUBJECTS／lead() 移植，
// 兩份文案語意需保持一致（email 與站內通知描述同一事件）；worker 為獨立
// package（自帶 node_modules 與 tsconfig），故不直接共用模組。

import type { NotificationType } from "@/lib/types/database";

interface NotificationMeta {
  /** 通知標題（對應 email 主旨） */
  title: string;
  /** 一句話內文（對應 email 首段） */
  lead: string;
  /** 點擊通知的導向頁（相對路徑）；無明確對應頁則省略 */
  href?: string;
}

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  account_review_result: {
    title: "您的志工帳號審核結果",
    lead: "您的志工帳號審核已有結果。",
    href: "/profile",
  },
  registration_review_result: {
    title: "您的報名審核結果",
    lead: "您的活動報名審核已有結果。",
    href: "/profile/registrations",
  },
  cancel_review_result: {
    title: "您的取消申請審核結果",
    lead: "您的報名取消申請審核已有結果。",
    href: "/profile/registrations",
  },
  blacklist_added: {
    title: "服務出席提醒：帳號已進入限制名單",
    lead: "因未依規定完成服務，您的帳號已進入限制名單，期間將暫停報名。",
    href: "/profile",
  },
  blacklist_cascade_cancelled: {
    title: "您的報名已因限制名單被取消",
    lead: "您有報名因帳號狀態異動而被取消。",
    href: "/profile/registrations",
  },
  review_reminder: {
    title: "【主辦提醒】有待審核的報名",
    lead: "您主辦的活動有尚待審核的報名，請盡快處理。",
    href: "/admin/registrations",
  },
  activity_reminder: {
    title: "活動即將開始提醒",
    lead: "您報名的活動即將開始，敬請準時參加。",
    href: "/profile/registrations",
  },
  activity_cancelled: {
    title: "活動取消通知",
    lead: "您報名的活動已取消。",
    href: "/profile/registrations",
  },
  session_cancelled: {
    title: "場次取消通知",
    lead: "您報名的場次已取消。",
    href: "/profile/registrations",
  },
  session_time_changed: {
    title: "場次時間異動通知",
    lead: "您報名的場次時間已異動，請確認新的時間。",
    href: "/profile/registrations",
  },
  schedule_conflict_alert: {
    title: "場次時間異動造成的時段衝突提醒",
    lead: "場次時間異動後偵測到您的報名時段可能衝突，請確認。",
    href: "/profile/registrations",
  },
  registration_cancelled_by_admin: {
    title: "您的報名已被取消",
    lead: "您有報名因帳號狀態異動而被取消。",
    href: "/profile/registrations",
  },
  deactivation_requested: {
    title: "【社工提醒】志工提出帳號停用申請",
    lead: "您負責的志工提出了帳號停用申請，請至後台審核。",
    href: "/admin/volunteers",
  },
  deactivation_review_result: {
    title: "您的帳號停用申請審核結果",
    lead: "您的帳號停用申請已有審核結果。",
    href: "/profile/settings",
  },
  email_verification: {
    title: "您的 Email 驗證碼",
    lead: "您索取的 Email 驗證碼已寄到聯絡信箱，請至驗證頁輸入。",
    href: "/profile/verify-email",
  },
};

const FALLBACK_META: NotificationMeta = {
  title: "平台通知",
  lead: "您在平台有一則新通知。",
};

const TW_DATETIME = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

function formatTW(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return TW_DATETIME.format(d);
}

export interface NotificationDisplay {
  title: string;
  /** 內文行：lead ＋ payload 內可安全顯示的補充（活動名稱／時間） */
  lines: string[];
  href?: string;
}

// 將一筆通知（type + payload）轉成顯示內容。payload 多為內部 id，
// 僅挑活動名稱與時間類欄位呈現（與 email 內文的最小揭露原則一致）。
export function getNotificationDisplay(
  type: string,
  payload: Record<string, unknown> | null
): NotificationDisplay {
  const meta = NOTIFICATION_META[type as NotificationType] ?? FALLBACK_META;
  const lines = [meta.lead];

  const activityTitle = payload?.["activity_title"];
  if (typeof activityTitle === "string" && activityTitle) {
    lines.push(`活動：${activityTitle}`);
  }
  const startAt = formatTW(payload?.["start_at"]);
  if (startAt) lines.push(`活動時間：${startAt}`);
  const releaseAt = formatTW(payload?.["expected_release_at"]);
  if (releaseAt) lines.push(`預計解除：${releaseAt}`);

  return { title: meta.title, lines, href: meta.href };
}
