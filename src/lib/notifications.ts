// 站內通知的顯示文案與導向連結（通知中心用），以及「是否寄信」的可關閉性政策。
// 標題／內文自 workers/orchestrator/src/index.ts 的 SUBJECTS／lead() 移植，
// 兩份文案語意需保持一致（email 與站內通知描述同一事件）；worker 為獨立
// package（自帶 node_modules 與 tsconfig），故不直接共用模組。

import { formatDateTime, formatSessionRange } from "@/lib/admin/datetime";
import type { NotificationType } from "@/lib/types/database";

/**
 * 寄信開關的可關閉層級（見 33_notification_email_settings.sql）：
 * - locked：強制寄送。目前只有 email_verification（OTP，關掉會讓註冊／自行簽到壞掉）。
 * - admin_only：「事情發生了、你必須知道」，只有全站設定可關，收件人不可自行關閉。
 * - user_optional：提醒／待辦類，重複性高，收件人可自行關閉。
 */
export type EmailToggleLevel = "locked" | "admin_only" | "user_optional";

/** 收件對象；決定各設定頁要列出哪些項目。 */
export type NotificationAudience = "volunteer" | "staff" | "both";

interface NotificationMeta {
  /** 通知標題（對應 email 主旨） */
  title: string;
  /** 一句話內文（對應 email 首段） */
  lead: string;
  /** 點擊通知的導向頁（相對路徑）；無明確對應頁則省略 */
  href?: string;
  /** 寄信可關閉層級 */
  emailToggle: EmailToggleLevel;
  /** 收件對象 */
  audience: NotificationAudience;
}

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  account_review_result: {
    title: "您的志工帳號審核結果",
    lead: "您的志工帳號審核已有結果。",
    href: "/profile",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  registration_review_result: {
    title: "您的報名審核結果",
    lead: "您的活動報名審核已有結果。",
    href: "/profile/registrations",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  cancel_review_result: {
    title: "您的取消申請審核結果",
    lead: "您的報名取消申請審核已有結果。",
    href: "/profile/registrations",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  blacklist_added: {
    title: "服務出席提醒：帳號已進入限制名單",
    lead: "因未依規定完成服務，您的帳號已進入限制名單，期間將暫停報名。",
    href: "/profile",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  blacklist_cascade_cancelled: {
    title: "您的報名已因限制名單被取消",
    lead: "您有報名因帳號狀態異動而被取消。",
    href: "/profile/registrations",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  review_reminder: {
    title: "【主辦提醒】有待審核的報名",
    lead: "您主辦的活動有尚待審核的報名，請盡快處理。",
    href: "/admin/registrations",
    emailToggle: "user_optional",
    audience: "staff",
  },
  activity_reminder: {
    title: "活動即將開始提醒",
    lead: "您報名的活動即將開始，敬請準時參加。",
    href: "/profile/registrations",
    emailToggle: "user_optional",
    audience: "volunteer",
  },
  activity_cancelled: {
    title: "活動取消通知",
    lead: "您報名的活動已取消。",
    href: "/profile/registrations",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  session_cancelled: {
    title: "場次取消通知",
    lead: "您報名的場次已取消。",
    href: "/profile/registrations",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  session_time_changed: {
    title: "場次時間異動通知",
    lead: "您報名的場次時間已異動，請確認新的時間。",
    href: "/profile/registrations",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  schedule_conflict_alert: {
    title: "場次時間異動造成的時段衝突提醒",
    lead: "場次時間異動後偵測到您的報名時段可能衝突，請確認。",
    href: "/profile/registrations",
    emailToggle: "user_optional",
    audience: "both", // 同時發給志工與主辦人（見 02_triggers.sql fn_session_time_changed）
  },
  registration_cancelled_by_admin: {
    title: "您的報名已被取消",
    lead: "您有報名因帳號狀態異動而被取消。",
    href: "/profile/registrations",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  deactivation_requested: {
    title: "【社工提醒】志工提出帳號停用申請",
    lead: "您負責的志工提出了帳號停用申請，請至後台審核。",
    href: "/admin/volunteers",
    emailToggle: "user_optional",
    audience: "staff",
  },
  deactivation_review_result: {
    title: "您的帳號停用申請審核結果",
    lead: "您的帳號停用申請已有審核結果。",
    href: "/profile/settings",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
  email_verification: {
    title: "您的 Email 驗證碼",
    lead: "您索取的 Email 驗證碼已寄到聯絡信箱，請至驗證頁輸入。",
    href: "/profile/verify-email",
    emailToggle: "locked", // OTP：關掉會讓註冊與自行簽到直接壞掉
    audience: "both",
  },
  registration_submitted: {
    title: "【審核提醒】有新的活動報名",
    lead: "有新的活動報名待審核，請登入後台協助審核（其他職員亦可審核）。",
    href: "/admin/registrations",
    emailToggle: "user_optional",
    audience: "staff",
  },
  account_review_pending: {
    title: "【審核提醒】有新的志工帳號待審核",
    lead: "有新的志工帳號待審核，請登入後台協助審核。",
    href: "/admin/volunteer-review",
    emailToggle: "user_optional",
    audience: "staff",
  },
  custom_service_submitted: {
    title: "【審核提醒】有志工上傳自訂服務待審核",
    lead: "有志工上傳了自訂服務時數紀錄待審核，請登入後台審核。",
    href: "/admin/custom-service",
    emailToggle: "user_optional",
    audience: "staff",
  },
  custom_service_result: {
    title: "您的自訂服務登錄審核結果",
    lead: "您登錄的自訂服務時數已有審核結果。",
    href: "/profile/custom-service",
    emailToggle: "admin_only",
    audience: "volunteer",
  },
};

const FALLBACK_META: NotificationMeta = {
  title: "平台通知",
  lead: "您在平台有一則新通知。",
  emailToggle: "admin_only",
  audience: "both",
};

const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_META) as NotificationType[];

/**
 * 列出某個設定頁該顯示的通知型別（維持 NOTIFICATION_META 的宣告順序）。
 * @param scope admin＝全站設定（locked 以外皆可關）；user＝個人偏好（僅 user_optional）
 * @param audience 給定時只留下該對象會收到的通知（both 一律保留）
 */
export function emailTogglableTypes(
  scope: "admin" | "user",
  audience?: "volunteer" | "staff"
): NotificationType[] {
  return NOTIFICATION_TYPES.filter((type) => {
    const meta = NOTIFICATION_META[type];
    if (meta.emailToggle === "locked") return false;
    if (scope === "user" && meta.emailToggle !== "user_optional") return false;
    if (audience && meta.audience !== "both" && meta.audience !== audience) return false;
    return true;
  });
}

export interface NotificationDisplay {
  title: string;
  /** 內文行：lead ＋ payload 內可安全顯示的補充（活動名稱／時間） */
  lines: string[];
  href?: string;
}

// 32_* 之後 payload 一律帶 activity_title；registration_submitted 的舊 payload
// 只有 title，故單獨列入白名單。custom_service_* 的 title 是「服務紀錄」名稱
// 而非活動名稱，所以不能用無條件 fallback。
const LEGACY_TITLE_TYPES = new Set<string>(["registration_submitted"]);

function safeIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

// 將一筆通知（type + payload）轉成顯示內容。payload 多為內部 id，
// 僅挑活動名稱與時間類欄位呈現（與 email 內文的最小揭露原則一致）。
// 欄位與標籤需與 workers/orchestrator/src/index.ts 的 detailLines() 對齊。
export function getNotificationDisplay(
  type: string,
  payload: Record<string, unknown> | null
): NotificationDisplay {
  const meta = NOTIFICATION_META[type as NotificationType] ?? FALLBACK_META;
  const lines = [meta.lead];

  let activityTitle = payload?.["activity_title"];
  if (typeof activityTitle !== "string" || !activityTitle) {
    activityTitle = LEGACY_TITLE_TYPES.has(type) ? payload?.["title"] : undefined;
  }
  if (typeof activityTitle === "string" && activityTitle) {
    lines.push(`活動名稱：${activityTitle}`);
  }

  // session_time_changed 的舊 payload 只有 new_start_at/new_end_at
  const start = safeIso(payload?.["start_at"] ?? payload?.["new_start_at"]);
  const end = safeIso(payload?.["end_at"] ?? payload?.["new_end_at"]);
  if (start) {
    lines.push(`場次時間：${end ? formatSessionRange(start, end) : formatDateTime(start)}`);
  }

  const volunteer = payload?.["volunteer"];
  if (type === "registration_submitted" && typeof volunteer === "string" && volunteer) {
    lines.push(`報名學生：${volunteer}`);
  }
  const pendingCount = payload?.["pending_count"];
  if (type === "review_reminder" && typeof pendingCount === "number" && pendingCount > 0) {
    lines.push(`待審報名：${pendingCount} 筆`);
  }

  const releaseAt = safeIso(payload?.["expected_release_at"]);
  if (releaseAt) lines.push(`預計解除：${formatDateTime(releaseAt)}`);

  return { title: meta.title, lines, href: meta.href };
}
