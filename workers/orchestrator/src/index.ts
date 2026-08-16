// Cloudflare Cron Worker：志工平台背景編排器（orchestrator）
//
// 只用「單一每分鐘 cron」，在 scheduled() 內依 UTC 時間自行分派——因為
// Cloudflare Free 方案每個 Worker 最多 3 個 cron trigger，逐一註冊 6 個會失敗。
// 時間為 UTC（台灣 = UTC+8）：
//   每分鐘         ：消化 notification_outbox（status='pending'）→ Resend 寄出
//   每 15 分       ：job_advance_activity_status（活動 open→closed→completed）
//   19:10 UTC(03:10)：job_attendance_scan（缺席判定＋黑名單觸發＋級聯取消）
//   19:20 UTC(03:20)：job_release_blacklists（黑名單到期自動解除）
//   01:00 UTC(09:00)：job_send_review_reminders（主辦審核提醒→入列）
//   10:00 UTC(18:00)：job_send_activity_reminders（活動開始前提醒→入列）
//
// 設計沿革：原為 Supabase Edge Function（Deno）＋ pg_cron/pg_net 每分鐘觸發；
//   為「以 Cloudflare 為中心、少綁 Supabase」改為本 worker，pg_cron 已移除。
//   job_* 仍是 Postgres 端可攜的 plpgsql，僅由此以 service_role RPC 觸發。
//
// 併發備註：outbox 走 claim/complete 佇列（見 supabase/v2/42_notification_queue_hardening.sql）：
//   rpc_claim_notifications 以 FOR UPDATE SKIP LOCKED 原子佔用（pending → processing），
//   寄完再以 rpc_complete_notification 回報終態。之所以不能只靠回寫時檢查狀態，是因為
//   那時信已經送到 Resend 了——重複寄送要在「取件」擋，不是在「回寫」擋。
//   暫時性失敗由 DB 端算退避（30s→2m→10m→1h→6h），逾次數進 dead letter；
//   卡在 processing 的列由 job_requeue_stuck_notifications 於 5 分鐘後收回。
//   job_* 皆為冪等設計（見 supabase/v2/05_scheduled_jobs.sql），偶發延遲／重跑可容忍。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  MAIL_FROM?: string;
  SITE_URL?: string;
  // 可選：保護手動測試用的 fetch 入口（未設定則 fetch 一律 403）
  MANUAL_TRIGGER_SECRET?: string;
  // 可選：app worker 例外告警（見 checkWorkerErrors）。三者皆設定才會啟用。
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  ALERT_EMAIL_TO?: string;
  // 可選：門檻與監看對象（預設 1 次、監看 "volunteer"）
  ALERT_MIN_ERRORS?: string;
  ALERT_WORKER_NAME?: string;
  // 可選：健康檢查告警的冷卻時間（分鐘，預設 60）。見 checkAppHealth。
  ALERT_HEALTH_COOLDOWN_MINUTES?: string;
}

const BATCH_SIZE = 50;
const DEFAULT_MAIL_FROM = "宜蘭家扶志工平台 <noreply@example.org>";

// 本 worker 期望的 DB schema 版本（= supabase/v2/ 最新一支 patch 的編號）。
// 新增 SQL patch 時一併更新，供 ?health=1 偵測部署漂移。
const EXPECTED_DB_SCHEMA = "43";

// 手動觸發入口（fetch ?job=）僅允許這 8 支排程函式；避免把外部傳入的字串
// 當函式名直接丟給 admin.rpc()（縱深防禦，即使 secret 外洩也限縮可觸發範圍）。
const ALLOWED_JOBS = new Set<string>([
  "job_advance_activity_status",
  "job_attendance_scan",
  "job_release_blacklists",
  "job_send_review_reminders",
  "job_send_activity_reminders",
  "job_purge_expired",
  "job_purge_rejected_accounts",
  "job_requeue_stuck_notifications",
]);

// rpc_claim_notifications 的回傳形狀（42_notification_queue_hardening.sql）
interface OutboxRow {
  id: string;
  recipient_user_id: string;
  notification_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

function adminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 日期時間格式與 src/lib/admin/datetime.ts 的全站規範一致
//（日期 YYYY-MM-DD 補零且一律帶年份、時間 24 小時制 HH:mm、一律 Asia/Taipei）。
// worker 為獨立 package，故複製一份而非共用模組。
// 位移到台灣本地時刻後直接切字串，與站內 splitTaipeiLocal 同一套機制
//（台灣無日光節約，固定 +8 小時是精確的）。
function taipeiParts(d: Date): { date: string; time: string } {
  const local = new Date(d.getTime() + 8 * 3_600_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
// 星期只放一個字「五」。刻意不用 Intl 的 weekday:"short"——zh-TW 會吐「週五」。
// 與站內 taipeiWeekday / WEEKDAY_LABELS 一致（src/lib/admin/datetime.ts）。
const MAIL_WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// worker 跑在 UTC，直接用 getDay() 會在台灣時間 08:00 前切錯天，故先位移再取。
function taipeiWeekdayLabel(d: Date): string {
  return MAIL_WEEKDAY_LABELS[new Date(d.getTime() + 8 * 3_600_000).getUTCDay()];
}

/** 單一時刻「2026-07-13 09:00」；對齊站內 formatDateTime。 */
function formatTW(value: unknown): string {
  const d = toDate(value);
  if (!d) return "";
  const { date, time } = taipeiParts(d);
  return `${date} ${time}`;
}

/** 含星期的時刻「2026-07-13（一）09:00」；formatRangeTW 的兩端共用。 */
function formatDayTimeTW(d: Date): string {
  const { date, time } = taipeiParts(d);
  return `${date}（${taipeiWeekdayLabel(d)}）${time}`;
}

/**
 * 場次起訖：同日「2026-07-13（一）09:00–12:00」，跨日附完整兩端。
 * 對齊站內 formatSessionRange（src/lib/admin/datetime.ts）。
 * 結束時間缺漏或非法時只顯示開始時刻。
 */
function formatRangeTW(start: unknown, end: unknown): string {
  const startDate = toDate(start);
  if (!startDate) return "";
  const startText = formatDayTimeTW(startDate);
  const endDate = toDate(end);
  if (!endDate) return startText;
  return taipeiParts(startDate).date === taipeiParts(endDate).date
    ? `${startText}–${taipeiParts(endDate).time}`
    : `${startText} ～ ${formatDayTimeTW(endDate)}`;
}

const SUBJECTS: Record<string, string> = {
  account_review_result: "您的志工帳號審核結果",
  registration_review_result: "您的報名審核結果",
  cancel_review_result: "您的取消申請審核結果",
  blacklist_added: "服務出席提醒：帳號已進入限制名單",
  blacklist_cascade_cancelled: "您的報名已因限制名單被取消",
  review_reminder: "【主辦提醒】有待審核的報名",
  activity_reminder: "活動即將開始提醒",
  activity_cancelled: "活動取消通知",
  session_cancelled: "場次取消通知",
  session_time_changed: "場次時間異動通知",
  schedule_conflict_alert: "場次時間異動造成的時段衝突提醒",
  registration_cancelled_by_admin: "您的報名已被取消",
  deactivation_requested: "【社工提醒】志工提出帳號停用申請",
  deactivation_review_result: "您的帳號停用申請審核結果",
  email_verification: "您的 Email 驗證碼",
  registration_submitted: "【審核提醒】有新的活動報名",
  account_review_pending: "【審核提醒】有新的志工帳號待審核",
  custom_service_submitted: "【審核提醒】有志工上傳自訂服務待審核",
  custom_service_result: "您的自訂服務登錄審核結果",
};

// 通知內文以「已發生事件 + 登入查看」為主；payload 多為內部 id，故僅在有
// 明確時間（start_at）時附上，其餘引導至平台查看詳情，避免外洩過多資料。
function lead(type: string): string {
  switch (type) {
    case "account_review_result":
      return "您的志工帳號審核已有結果。";
    case "registration_review_result":
      return "您的活動報名審核已有結果。";
    case "cancel_review_result":
      return "您的報名取消申請審核已有結果。";
    case "blacklist_added":
      return "因未依規定完成服務，您的帳號已進入限制名單，期間將暫停報名。";
    case "blacklist_cascade_cancelled":
    case "registration_cancelled_by_admin":
      return "您有報名因帳號狀態異動而被取消。";
    case "review_reminder":
      return "您主辦的活動有尚待審核的報名，請盡快處理。";
    case "activity_reminder":
      return "您報名的活動即將開始，敬請準時參加。";
    case "activity_cancelled":
      return "您報名的活動已取消。";
    case "session_cancelled":
      return "您報名的場次已取消。";
    case "session_time_changed":
      return "您報名的場次時間已異動，請確認新的時間。";
    case "schedule_conflict_alert":
      return "場次時間異動後偵測到您的報名時段可能衝突，請確認。";
    case "deactivation_requested":
      return "您負責的志工提出了帳號停用申請，請至後台審核。";
    case "deactivation_review_result":
      return "您的帳號停用申請已有審核結果。";
    case "email_verification":
      return "以下是您的 Email 驗證碼，請於平台的驗證頁輸入以完成驗證。";
    case "registration_submitted":
      return "有新的活動報名待審核，請登入後台協助審核（其他職員亦可審核）。";
    case "account_review_pending":
      return "有新的志工帳號待審核，請登入後台協助審核。";
    case "custom_service_submitted":
      return "有志工上傳了自訂服務時數紀錄待審核，請登入後台審核。";
    case "custom_service_result":
      return "您登錄的自訂服務時數已有審核結果。";
    default:
      return "您在志工平台有一則新通知。";
  }
}

const TEXT_FOOTER = "— 宜蘭家扶中心志工平台（此為系統自動通知，請勿直接回覆）";

// 所有信件共用的外框（字體／顏色／頁尾）；各分支只組中間的段落。
function htmlShell(body: string): string {
  return `<div style="font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;font-size:15px;color:#0f172a;line-height:1.7">
${body}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
  <p style="color:#94a3b8;font-size:12px">宜蘭家扶中心志工平台 · 此為系統自動通知，請勿直接回覆</p>
</div>`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// 32_* 之後 payload 一律帶 activity_title；registration_submitted 的舊 payload
// 只有 title，故單獨列入白名單。custom_service_* 的 title 是「服務紀錄」名稱
// 而非活動名稱，所以不能用無條件 fallback。
const LEGACY_TITLE_TYPES = new Set<string>(["registration_submitted"]);

function activityTitleOf(type: string, payload: Record<string, unknown>): string {
  const title = str(payload["activity_title"]);
  if (title) return title;
  return LEGACY_TITLE_TYPES.has(type) ? str(payload["title"]) : "";
}

interface DetailLine {
  label: string;
  value: string;
}

// 信件中可安全揭露的補充欄位。需與 src/lib/notifications.ts 的
// getNotificationDisplay() 對齊（兩邊呈現同一組欄位與標籤）。
function detailLines(type: string, payload: Record<string, unknown>): DetailLine[] {
  const lines: DetailLine[] = [];

  const title = activityTitleOf(type, payload);
  if (title) lines.push({ label: "活動名稱", value: title });

  // session_time_changed 的舊 payload 只有 new_start_at/new_end_at
  const when = formatRangeTW(
    payload["start_at"] ?? payload["new_start_at"],
    payload["end_at"] ?? payload["new_end_at"]
  );
  if (when) lines.push({ label: "場次時間", value: when });

  if (type === "registration_submitted") {
    const who = str(payload["volunteer"]);
    if (who) lines.push({ label: "報名學生", value: who });
  }
  if (type === "review_reminder") {
    const n = payload["pending_count"];
    if (typeof n === "number" && n > 0) {
      lines.push({ label: "待審報名", value: `${n} 筆` });
    }
  }

  const release = formatTW(payload["expected_release_at"]);
  if (release) lines.push({ label: "預計解除", value: release });

  return lines;
}

function detailsText(lines: DetailLine[]): string[] {
  return lines.map((d) => `${d.label}：${d.value}`);
}

function detailsHtml(lines: DetailLine[]): string {
  return lines
    .map(
      (d) =>
        `  <p style="color:#475569">${escapeHtml(d.label)}：${escapeHtml(d.value)}</p>`
    )
    .join("\n");
}

function renderTemplate(
  type: string,
  payload: Record<string, unknown>,
  name: string,
  siteUrl: string,
  otpCode: string
): { subject: string; html: string; text: string } {
  const subject = SUBJECTS[type] ?? "志工平台通知";
  const greeting = name ? `${name} 您好：` : "您好：";
  const cta = siteUrl || "";

  // Email 驗證碼：內文以驗證碼為主，不引導點連結（避免釣魚觀感）。
  // 碼由呼叫端從 email_verifications 取得——絕不放進 outbox payload，因為
  // 站內通知讓使用者讀得到自己的通知列，明碼放 payload 等於讓 OTP 免進信箱可得
  // （見 supabase/v2/40_otp_leak_fix.sql）。
  const code = type === "email_verification" ? otpCode.trim() : "";

  if (code) {
    const text = [
      greeting,
      "",
      lead(type),
      "",
      `驗證碼：${code}`,
      "此驗證碼 15 分鐘內有效，請勿轉發他人。",
      "",
      TEXT_FOOTER,
    ].join("\n");
    const html = htmlShell(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(lead(type))}</p>
  <p style="font-size:28px;font-weight:800;letter-spacing:6px;color:#0f172a;margin:16px 0">${escapeHtml(code)}</p>
  <p style="color:#475569">此驗證碼 15 分鐘內有效，請勿轉發他人。</p>`);
    return { subject, html, text };
  }

  // 自訂服務審核結果：內文帶紀錄名稱與通過/未通過。
  if (type === "custom_service_result") {
    const title = String(payload?.["title"] ?? "").trim();
    const approved = payload?.["approved"] === true;
    const resultLine = approved
      ? "審核結果：已通過，服務時數已計入您的累計時數。"
      : "審核結果：未通過。如有疑問請洽負責社工。";
    const titleLine = title ? `服務紀錄：${title}` : "";
    const text = [greeting, "", lead(type), titleLine, resultLine, "", cta ? `可登入平台查看：${cta}` : "請登入平台查看。", "", TEXT_FOOTER]
      .filter((l) => l !== "")
      .join("\n");
    const html = htmlShell(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(lead(type))}</p>
  ${title ? `<p style="color:#475569">服務紀錄：${escapeHtml(title)}</p>` : ""}
  <p style="font-weight:700;color:${approved ? "#047857" : "#b45309"}">${escapeHtml(resultLine)}</p>
  ${cta ? `<p>可<a href="${escapeHtml(cta)}" style="color:#2563eb">登入平台</a>查看。</p>` : "<p>請登入平台查看。</p>"}`);
    return { subject, html, text };
  }

  const details = detailLines(type, payload ?? {});

  // 報名／取消審核結果：除了活動名稱與場次時間，直接寫明通過或未通過，
  // 免得志工還要登入才知道結果。
  if (type === "registration_review_result" || type === "cancel_review_result") {
    const approved = payload?.["approved"] === true;
    const assigned =
      type === "registration_review_result" && payload?.["assigned"] === true;

    // 後台直接指派：志工從未報名，寫「審核已有結果」會不知所云。
    const leadLine = assigned
      ? "職員已直接為您安排一場活動場次，資訊如下。"
      : lead(type);

    let resultLine: string;
    let resultColor: string;
    if (type === "cancel_review_result") {
      // 此型別的 approved＝「同意取消」，語意易誤解，故加括號說明；
      // 兩種結果都用中性色（綠色配「已取消」讀起來會怪）。
      resultLine = approved
        ? "審核結果：已通過（同意取消）。您的這筆報名已取消，名額已釋出。"
        : "審核結果：未通過（不同意取消）。您的報名維持有效，請準時出席；如有困難請盡快聯繫負責社工。";
      resultColor = "#0f172a";
    } else if (assigned) {
      resultLine =
        "安排結果：已為您安排此場次。此為職員直接指派，您無需另行報名，請準時出席。";
      resultColor = "#047857";
    } else if (approved) {
      resultLine = "審核結果：已通過。您的報名已核准，請準時出席。";
      resultColor = "#047857";
    } else {
      resultLine = "審核結果：未通過。本次報名未獲核准，如有疑問請洽負責社工。";
      resultColor = "#b45309";
    }

    const text = [
      greeting,
      "",
      leadLine,
      ...detailsText(details),
      resultLine,
      "",
      cta ? `可登入平台查看：${cta}` : "請登入平台查看。",
      "",
      TEXT_FOOTER,
    ]
      .filter((l) => l !== "")
      .join("\n");

    const html = htmlShell(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(leadLine)}</p>
${detailsHtml(details)}
  <p style="font-weight:700;color:${resultColor}">${escapeHtml(resultLine)}</p>
  ${cta ? `<p>可<a href="${escapeHtml(cta)}" style="color:#2563eb">登入平台</a>查看。</p>` : "<p>請登入平台查看。</p>"}`);
    return { subject, html, text };
  }

  const text = [
    greeting,
    "",
    lead(type),
    ...detailsText(details),
    "",
    cta ? `請登入平台查看詳情：${cta}` : "請登入平台查看詳情。",
    "",
    TEXT_FOOTER,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const html = htmlShell(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(lead(type))}</p>
${detailsHtml(details)}
  <p>${cta ? `請<a href="${escapeHtml(cta)}" style="color:#2563eb">登入平台</a>查看詳情。` : "請登入平台查看詳情。"}</p>`);

  return { subject, html, text };
}

async function resolveRecipients(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, { email: string; name: string }>> {
  const map = new Map<string, { email: string; name: string }>();
  const [{ data: vols }, { data: staff }] = await Promise.all([
    admin.from("volunteer_profiles").select("id, email, full_name").in("id", ids),
    admin.from("staff_profiles").select("id, email, full_name").in("id", ids),
  ]);
  for (const r of vols ?? []) map.set(r.id, { email: r.email, name: r.full_name });
  for (const r of staff ?? [])
    if (!map.has(r.id)) map.set(r.id, { email: r.email, name: r.full_name });

  // 兜底：profile 查不到者（極少見）改問 auth
  for (const id of ids) {
    if (map.has(id)) continue;
    const { data } = await admin.auth.admin.getUserById(id);
    const user = data?.user;
    if (user?.email) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      map.set(id, { email: user.email, name: (meta.full_name as string) ?? "" });
    }
  }
  return map;
}

// 寄信失敗時以 retryable 標記是否為「暫時性」錯誤（網路/5xx/429）：暫時性者保留
// pending 由下一輪重試，永久性（4xx，如收件者無效）才標 failed。
class SendError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM ?? DEFAULT_MAIL_FROM,
        to,
        subject,
        html,
        text,
      }),
    });
  } catch (e) {
    // 網路層錯誤（DNS/連線）→ 暫時性，保留重試
    throw new SendError(
      `resend network error: ${e instanceof Error ? e.message : String(e)}`,
      true
    );
  }
  if (!res.ok) {
    const body = await res.text();
    // 5xx / 429 視為暫時性；其餘（4xx）視為永久失敗
    throw new SendError(
      `resend ${res.status}: ${body.slice(0, 300)}`,
      res.status >= 500 || res.status === 429
    );
  }
}

// 兩層寄信開關（33_notification_email_settings.sql）：任一層命中即不寄信。
// 回傳 [全站停寄集合, 各收件人停寄集合]；任一查詢失敗都當作「全部照寄」，
// 寧可多寄也不要因設定讀不到而靜默漏信（也讓 worker 先於 33 部署時仍能運作）。
async function loadEmailToggles(
  admin: SupabaseClient,
  recipientIds: string[]
): Promise<{ global: Set<string>; perUser: Map<string, Set<string>> }> {
  const [settingsRes, prefsRes] = await Promise.all([
    admin.from("system_settings").select("email_disabled_types").maybeSingle(),
    admin
      .from("notification_email_prefs")
      .select("user_id, disabled_types")
      .in("user_id", recipientIds),
  ]);

  if (settingsRes.error) {
    console.warn(
      `[orchestrator] 讀取全站寄信設定失敗，本輪一律照寄：${settingsRes.error.message}`
    );
  }
  if (prefsRes.error) {
    console.warn(
      `[orchestrator] 讀取個人寄信偏好失敗，本輪一律照寄：${prefsRes.error.message}`
    );
  }

  const global = new Set<string>(
    (settingsRes.data?.email_disabled_types as string[] | null) ?? []
  );
  const perUser = new Map<string, Set<string>>();
  for (const row of prefsRes.data ?? []) {
    perUser.set(row.user_id, new Set<string>(row.disabled_types ?? []));
  }
  return { global, perUser };
}

// Email OTP 明碼只存在 email_verifications（該表 REVOKE ALL、無 policy，只有
// service_role 與 SECURITY DEFINER RPC 進得去），不進 outbox payload——payload
// 會被使用者自己讀到，等於讓驗證碼免進信箱可得（見 supabase/v2/40_otp_leak_fix.sql）。
// 每位志工至多一筆有效碼（PK 為 volunteer_id），故直接以 recipient 取。
async function loadOtpCodes(
  admin: SupabaseClient,
  volunteerIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (volunteerIds.length === 0) return map;

  const { data, error } = await admin
    .from("email_verifications")
    .select("volunteer_id, code, expires_at, consumed_at")
    .in("volunteer_id", volunteerIds);

  if (error) {
    // 讀不到就讓該列走 retryable 失敗（下一輪再試），不要寄出空白驗證碼。
    console.warn(`[orchestrator] 讀取驗證碼失敗：${error.message}`);
    return map;
  }

  const now = Date.now();
  for (const row of data ?? []) {
    // 已用掉或已過期的碼寄出去也沒用，視同查無 → 呼叫端標為永久失敗。
    if (row.consumed_at) continue;
    if (Date.parse(row.expires_at) <= now) continue;
    map.set(row.volunteer_id, row.code);
  }
  return map;
}

// 消化 notification_outbox：佔用 → 解析收件者 → 組信 → Resend 寄出 → 回報結果
export async function drainOutbox(
  env: Env
): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
}> {
  const empty = { processed: 0, sent: 0, failed: 0, skipped: 0, retried: 0 };
  if (!env.RESEND_API_KEY) {
    console.warn("[orchestrator] RESEND_API_KEY 未設定，略過 outbox 消化");
    return empty;
  }

  const admin = adminClient(env);
  const siteUrl = (env.SITE_URL ?? "").replace(/\/+$/, "");
  // 每次執行一個識別字，寫進 locked_by 供診斷「是誰佔著這一列」。
  const workerId = crypto.randomUUID();

  // 先回收前一輪卡在 processing 的列（worker 中途被中斷時會留下）。
  // 失敗不致命——本輪照常取件即可，下一輪再回收。
  const { error: requeueError } = await admin.rpc("job_requeue_stuck_notifications");
  if (requeueError) {
    console.warn(`[orchestrator] 回收卡住的通知失敗：${requeueError.message}`);
  }

  // 佔用（pending → processing）與寄送是分開的兩步：claim 內部以
  // FOR UPDATE SKIP LOCKED 保證同一列不會被兩個執行個體同時取走，
  // 這是避免重複寄信的關鍵——回寫時才檢查狀態已經太晚，信早就送出去了。
  const { data: claimed, error } = await admin.rpc("rpc_claim_notifications", {
    p_limit: BATCH_SIZE,
    p_worker: workerId,
  });

  if (error) throw new Error(`佔用 outbox 失敗：${error.message}`);
  if (!claimed || claimed.length === 0) return empty;

  const rows = claimed as OutboxRow[];
  const recipientIds = [...new Set(rows.map((r) => r.recipient_user_id))];
  const otpRecipientIds = [
    ...new Set(
      rows
        .filter((r) => r.notification_type === "email_verification")
        .map((r) => r.recipient_user_id)
    ),
  ];
  const [recipients, toggles, otpCodes] = await Promise.all([
    resolveRecipients(admin, recipientIds),
    loadEmailToggles(admin, recipientIds),
    loadOtpCodes(admin, otpRecipientIds),
  ]);

  // 回報一列的終態。complete 失敗只記 log 不中斷整批：該列會停在 processing，
  // 5 分鐘後由 job_requeue_stuck_notifications 收回重試。
  const complete = async (id: string, status: string, err?: string) => {
    const { error: e } = await admin.rpc("rpc_complete_notification", {
      p_id: id,
      p_status: status,
      p_error: err ?? null,
    });
    if (e) console.error(`[orchestrator] 回報 ${id} (${status}) 失敗：${e.message}`);
  };

  let sent = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;
  for (const row of rows) {
    // 因設定而不寄：必須標成終端狀態，否則每分鐘重掃一次，
    // 且 23 的清理只刪非 pending/processing 的列，這些列會永遠留著。
    // 站內通知不受影響（read_at 與 status 正交，見 15_notification_center.sql）。
    if (
      // 三重防護之一：Email OTP 永不受設定影響，關掉會讓註冊／自行簽到壞掉。
      row.notification_type !== "email_verification" &&
      (toggles.global.has(row.notification_type) ||
        toggles.perUser.get(row.recipient_user_id)?.has(row.notification_type))
    ) {
      await complete(row.id, "skipped");
      skipped++;
      continue;
    }

    try {
      const rec = recipients.get(row.recipient_user_id);
      if (!rec?.email) throw new SendError("找不到收件者 email", false);

      // 驗證信必須有碼才寄。查無＝已用掉／已過期／使用者又索取了新碼，
      // 這封信寄出去也沒有意義，標為永久失敗不重試。
      let otpCode = "";
      if (row.notification_type === "email_verification") {
        otpCode = otpCodes.get(row.recipient_user_id) ?? "";
        if (!otpCode) throw new SendError("驗證碼已失效或不存在，略過寄送", false);
      }

      const tmpl = renderTemplate(
        row.notification_type,
        row.payload ?? {},
        rec.name,
        siteUrl,
        otpCode
      );
      await sendEmail(env, rec.email, tmpl.subject, tmpl.html, tmpl.text);
      await complete(row.id, "sent");
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retryable = e instanceof SendError ? e.retryable : true;
      if (retryable) {
        // 暫時性錯誤：交給 DB 算退避時間並放回 pending；達重試上限會自動轉 failed。
        await complete(row.id, "retry", message);
        retried++;
        continue;
      }
      await complete(row.id, "failed", message);
      failed++;
    }
  }

  console.log(
    `[orchestrator] outbox processed=${rows.length} sent=${sent} failed=${failed} retried=${retried} skipped=${skipped}`
  );
  return { processed: rows.length, sent, failed, skipped, retried };
}

// 以 service_role 觸發 Postgres 端的排程函式（job_*）
async function runJob(env: Env, fn: string): Promise<void> {
  const admin = adminClient(env);
  const { data, error } = await admin.rpc(fn);
  if (error) {
    console.error(`[orchestrator] ${fn} 失敗：${error.message}`);
    throw new Error(`${fn}: ${error.message}`);
  }
  console.log(`[orchestrator] ${fn} ok`, data ?? "");

  // 審核未通過帳號的清除：SQL 端刪完 public 的資料後回傳 id，Auth 帳號
  // 由這裡以 service role 補刪（比照 26_hard_delete.sql 的既有分工——
  // plpgsql 不碰 auth schema）。單筆失敗只記錄，不影響其餘。
  if (fn === "job_purge_rejected_accounts" && Array.isArray(data)) {
    for (const id of data as string[]) {
      const { error: authError } = await admin.auth.admin.deleteUser(id);
      if (authError) {
        console.error(
          `[orchestrator] 刪除 Auth 帳號 ${id} 失敗：${authError.message}`
        );
      }
    }
    if (data.length > 0) {
      console.log(`[orchestrator] 已清除審核未通過帳號 ${data.length} 筆`);
    }
  }
}

// ---- app worker 例外告警 -------------------------------------------------
//
// Cloudflare 沒有原生的 Workers 錯誤通知，故自建：每 15 分鐘查一次 GraphQL
// Analytics，統計 app worker（預設 "volunteer"）各 invocation status 的次數，
// 只要出現非成功狀態就寄信。用查詢而非 tail consumer，是因為時間區間天然彙總，
// 一次事故最多每 15 分鐘一封信，不需要另外做節流狀態。
//
// 需要一把唯讀 API token（權限：Account Analytics: Read）放在 CF_ANALYTICS_TOKEN。
// CF_ACCOUNT_ID／CF_ANALYTICS_TOKEN／ALERT_EMAIL_TO 任一未設定即整段略過（功能停用），
// 與 RESEND_API_KEY 未設定時略過寄信的行為一致。

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

// 正常結束的狀態（含使用者中途關閉連線），不算錯誤。
const HEALTHY_STATUSES = new Set(["success", "clientDisconnected", "canceled"]);

// Cloudflare 的 status → 中文說明（對照使用者實際看到的錯誤代碼）
const STATUS_LABEL: Record<string, string> = {
  scriptThrewException: "程式丟出未攔截的例外（使用者看到 Error 1101）",
  exceededCpu: "超過運算額度上限（使用者看到 Error 1102）",
  exceededMemory: "超過記憶體上限",
  responseStreamDisconnected: "回應串流中斷",
  internalError: "Cloudflare 平台內部錯誤",
  unknown: "未知狀態",
};

interface InvocationRow {
  sum?: { requests?: number; errors?: number };
  dimensions?: { status?: string };
}

// 查詢指定區間內各 status 的呼叫次數。查不到或查詢失敗一律回 null（呼叫端略過）。
async function fetchInvocationStatuses(
  env: Env,
  scriptName: string,
  start: Date,
  end: Date
): Promise<InvocationRow[] | null> {
  // 值皆來自環境變數與本函式產生的時間，不含外部輸入，故直接內嵌字面量，
  // 免去 Cloudflare GraphQL 各資料集之間變數型別（string / Time）不一致的問題。
  const query = `{
  viewer {
    accounts(filter: { accountTag: ${JSON.stringify(env.CF_ACCOUNT_ID)} }) {
      workersInvocationsAdaptive(
        limit: 100
        filter: {
          scriptName: ${JSON.stringify(scriptName)}
          datetime_geq: ${JSON.stringify(start.toISOString())}
          datetime_leq: ${JSON.stringify(end.toISOString())}
        }
      ) {
        sum { requests errors }
        dimensions { status }
      }
    }
  }
}`;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    console.error(
      `[orchestrator] analytics ${res.status}: ${(await res.text()).slice(0, 300)}`
    );
    return null;
  }

  const json = (await res.json()) as {
    data?: { viewer?: { accounts?: { workersInvocationsAdaptive?: InvocationRow[] }[] } };
    errors?: { message?: string }[];
  };
  if (json.errors?.length) {
    // GraphQL 的錯誤是 HTTP 200 帶 errors，必須另外檢查（例如 token 權限不足）
    console.error(
      "[orchestrator] analytics graphql errors:",
      json.errors.map((e) => e.message).join("; ")
    );
    return null;
  }
  return json.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
}

const TW_TIME = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface ErrorCheckResult {
  skipped?: string;
  window?: string;
  counts?: Record<string, number>;
  total?: number;
  alerted?: boolean;
}

// windowMinutes 預設 15＝排程用；手動觸發可拉長區間以驗證整條告警鏈是否暢通。
async function checkWorkerErrors(
  env: Env,
  scheduledTime: number,
  windowMinutes = 15
): Promise<ErrorCheckResult> {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN || !env.ALERT_EMAIL_TO) {
    return { skipped: "未設定 CF_ACCOUNT_ID／CF_ANALYTICS_TOKEN／ALERT_EMAIL_TO" };
  }
  if (!env.RESEND_API_KEY) return { skipped: "未設定 RESEND_API_KEY" };

  const scriptName = env.ALERT_WORKER_NAME ?? "volunteer";
  const threshold = Math.max(1, Number(env.ALERT_MIN_ERRORS ?? "1") || 1);

  // Analytics 有 1～2 分鐘的延遲，故整段區間往前推 1 分鐘；相鄰兩次查詢首尾相接。
  const end = new Date(scheduledTime - 60_000);
  const start = new Date(scheduledTime - (windowMinutes + 1) * 60_000);

  const rows = await fetchInvocationStatuses(env, scriptName, start, end);
  if (!rows) return { skipped: "查詢失敗（詳見 log）" };

  const counts = new Map<string, number>();
  for (const r of rows) {
    const status = r.dimensions?.status ?? "unknown";
    if (HEALTHY_STATUSES.has(status)) continue;
    counts.set(status, (counts.get(status) ?? 0) + (r.sum?.requests ?? 0));
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const window = `${TW_TIME.format(start)} ~ ${TW_TIME.format(end)}`;
  // 每次都留一行：沒有錯誤時這行就是「查詢管道正常」的唯一證據（token 有效、
  // GraphQL 回得來）。token 失效或權限不足會走上面 fetchInvocationStatuses 的
  // console.error，兩者在 `wrangler tail volunteer-orchestrator` 一眼可辨。
  console.log(
    `[orchestrator] 例外檢查 ${scriptName} ${window}：${total} 次`,
    total > 0 ? JSON.stringify(Object.fromEntries(counts)) : ""
  );
  const summary: ErrorCheckResult = {
    window,
    counts: Object.fromEntries(counts),
    total,
    alerted: false,
  };
  if (total < threshold) return summary;

  const lines = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const subject = `[志工平台] ${scriptName} 出現 ${total} 次錯誤（${window}）`;
  const text = [
    `監看對象：${scriptName}`,
    `區間（台灣時間）：${window}`,
    "",
    ...lines.map(([s, n]) => `${s}：${n} 次　${STATUS_LABEL[s] ?? ""}`),
    "",
    "查看詳細例外訊息：Cloudflare Dashboard → Compute (Workers) → " +
      `${scriptName} → Logs（篩 outcome = exception）`,
    `或即時觀察：npx wrangler tail ${scriptName} --status error`,
  ].join("\n");
  const html = [
    `<p>監看對象：<b>${escapeHtml(scriptName)}</b><br>區間（台灣時間）：${escapeHtml(window)}</p>`,
    "<ul>",
    ...lines.map(
      ([s, n]) =>
        `<li><b>${escapeHtml(s)}</b>：${n} 次　${escapeHtml(STATUS_LABEL[s] ?? "")}</li>`
    ),
    "</ul>",
    `<p>查看詳細例外訊息：Cloudflare Dashboard → Compute (Workers) → ${escapeHtml(scriptName)} → Logs（篩 outcome = exception）。<br>` +
      `即時觀察：<code>npx wrangler tail ${escapeHtml(scriptName)} --status error</code></p>`,
  ].join("");

  await sendEmail(env, env.ALERT_EMAIL_TO, subject, html, text);
  console.log(`[orchestrator] 已寄出錯誤告警：${subject}`);
  return { ...summary, alerted: true };
}

// ---- app 健康檢查（輪詢 /api/health）------------------------------------
//
// 為什麼要有這支：src/app/api/health/route.ts 會比對 app 期望的 schema 版本與 DB
// 實際版本（見 supabase/v2/43_schema_version.sql），但在此之前**沒有任何東西會
// 呼叫它**——端點寫好了，只有人工打開瀏覽器才看得到那個 503。
//
// 與 checkWorkerErrors 的分工：
//   checkWorkerErrors 查的是「已經發生過幾次例外」——事後、15 分鐘彙總、而且
//   **要有人來踩才會有錯誤數字**。深夜零流量時全站掛掉，它一次都不會告警。
//   checkAppHealth 查的是「現在還活著嗎、DB 版本對不對」——主動、即時，
//   沒有流量也照樣偵測得到。兩者互補，缺一邊都會有盲區。
//
// 節流：模組層變數記住上次寄信時間，預設 60 分鐘內不重複寄（可用
// ALERT_HEALTH_COOLDOWN_MINUTES 調整）。Workers 的 isolate 可能被回收而讓這個
// 狀態歸零——最壞情況是同一次事故多寄幾封信，**不會漏寄**；為此另外引入
// KV／Durable Object 並不划算（多一個綁定、多一個會壞的東西）。
// 恢復時補寄一封「已恢復」，否則「後來到底好了沒」只能靠人工再點一次。

interface HealthBody {
  status?: string;
  app?: { expectedDbSchema?: string };
  db?: { reachable?: boolean; schemaVersion?: string | null };
  drift?: boolean;
}

interface HealthCheckResult {
  skipped?: string;
  url?: string;
  ok?: boolean;
  httpStatus?: number;
  detail?: string;
  alerted?: boolean;
  recovered?: boolean;
}

// 上次寄出告警的時間（0 = 尚未寄過）與目前是否處於異常狀態。
let healthLastAlertAt = 0;
let healthIsDown = false;

async function checkAppHealth(
  env: Env,
  now: number
): Promise<HealthCheckResult> {
  if (!env.SITE_URL || !env.ALERT_EMAIL_TO) {
    return { skipped: "未設定 SITE_URL／ALERT_EMAIL_TO" };
  }
  if (!env.RESEND_API_KEY) return { skipped: "未設定 RESEND_API_KEY" };

  const url = `${env.SITE_URL.replace(/\/+$/, "")}/api/health`;
  let ok = false;
  let httpStatus = 0;
  let detail = "";

  try {
    // 10 秒逾時：健康檢查本身不該掛住整個 cron 執行。
    const res = await fetch(url, {
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
    });
    httpStatus = res.status;
    const body = (await res.json().catch(() => null)) as HealthBody | null;

    if (!body) {
      // 拿不到 JSON 代表根本沒進到那支 route（Worker 例外、平台錯誤頁、
      // 或網域／路由設定跑掉），這比 degraded 更嚴重。
      detail = `回應不是預期的 JSON（HTTP ${httpStatus}）`;
    } else if (body.status === "ok") {
      ok = true;
    } else if (body.db?.reachable === false) {
      detail = "app 連不到資料庫（Supabase 不可用，或 service role key 失效）";
    } else {
      detail =
        `DB schema 版本漂移：app 期望 ${body.app?.expectedDbSchema ?? "(未知)"}、` +
        `DB 實際 ${body.db?.schemaVersion ?? "(讀不到)"}。` +
        "最危險的情況是畫面看起來正常、但少了一段只存在於新 patch 的安全限制。";
    }
  } catch (e) {
    detail = `連線失敗：${e instanceof Error ? e.message : String(e)}`;
  }

  // 每次都留一行 log：正常時這行就是「檢查管道本身還活著」的唯一證據。
  console.log(
    `[orchestrator] 健康檢查 ${url}：${ok ? "ok" : `異常 — ${detail}`}`
  );

  const result: HealthCheckResult = {
    url,
    ok,
    httpStatus,
    detail: detail || undefined,
  };

  if (ok) {
    if (!healthIsDown) return result;
    // 由異常轉為正常：補一封恢復通知，並把節流狀態歸零。
    healthIsDown = false;
    healthLastAlertAt = 0;
    const subject = "[志工平台] 健康檢查已恢復正常";
    await sendEmail(
      env,
      env.ALERT_EMAIL_TO,
      subject,
      `<p>${escapeHtml(url)} 已回復 <b>ok</b>（HTTP ${httpStatus}）。</p>`,
      `${url} 已回復 ok（HTTP ${httpStatus}）。`
    );
    console.log(`[orchestrator] 已寄出恢復通知：${subject}`);
    return { ...result, recovered: true };
  }

  const cooldownMs =
    Math.max(1, Number(env.ALERT_HEALTH_COOLDOWN_MINUTES ?? "60") || 60) *
    60_000;
  const firstFailure = !healthIsDown;
  healthIsDown = true;
  if (!firstFailure && now - healthLastAlertAt < cooldownMs) {
    return { ...result, alerted: false };
  }
  healthLastAlertAt = now;

  const subject = `[志工平台] 健康檢查異常（HTTP ${httpStatus || "無回應"}）`;
  const text = [
    `檢查對象：${url}`,
    `時間（台灣）：${TW_TIME.format(new Date(now))}`,
    `HTTP 狀態：${httpStatus || "無回應"}`,
    "",
    detail,
    "",
    "排查順序：",
    `1. 直接開 ${url} 看目前回應`,
    "2. schema 漂移 → 到 Supabase SQL Editor 補跑 supabase/v2/ 尚未套用的 patch",
    "3. 連不到 → Cloudflare Dashboard → Compute (Workers) → volunteer → Logs",
    "4. 即時觀察：npx wrangler tail volunteer --status error",
  ].join("\n");
  const html = [
    `<p>檢查對象：<a href="${escapeHtml(url)}">${escapeHtml(url)}</a><br>`,
    `時間（台灣）：${escapeHtml(TW_TIME.format(new Date(now)))}<br>`,
    `HTTP 狀態：<b>${httpStatus || "無回應"}</b></p>`,
    `<p>${escapeHtml(detail)}</p>`,
    "<p>排查順序：</p><ol>",
    `<li>直接開 <a href="${escapeHtml(url)}">${escapeHtml(url)}</a> 看目前回應</li>`,
    "<li>schema 漂移 → 到 Supabase SQL Editor 補跑 <code>supabase/v2/</code> 尚未套用的 patch</li>",
    "<li>連不到 → Cloudflare Dashboard → Compute (Workers) → volunteer → Logs</li>",
    "<li>即時觀察：<code>npx wrangler tail volunteer --status error</code></li>",
    "</ol>",
  ].join("");

  await sendEmail(env, env.ALERT_EMAIL_TO, subject, html, text);
  console.log(`[orchestrator] 已寄出健康檢查告警：${subject}`);
  return { ...result, alerted: true };
}

// 依 scheduled 觸發時間（UTC）決定這一分鐘要跑哪些 job，最後統一消化 outbox
// （job 可能寫入新通知，放最後清一次即可同分鐘寄出）。job_* 皆冪等，偶發
// 重跑或延遲可容忍。
async function runScheduled(scheduledTime: number, env: Env): Promise<void> {
  const d = new Date(scheduledTime);
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();

  const jobs: string[] = [];
  if (mm % 15 === 0) jobs.push("job_advance_activity_status"); // 每 15 分
  if (hh === 19 && mm === 10) jobs.push("job_attendance_scan"); // 03:10 台灣
  if (hh === 19 && mm === 20) jobs.push("job_release_blacklists"); // 03:20 台灣
  if (hh === 19 && mm === 30) jobs.push("job_purge_expired"); // 03:30 台灣（定期清除）
  if (hh === 19 && mm === 35) jobs.push("job_purge_rejected_accounts"); // 03:35 台灣（清除逾期的未通過帳號）
  if (hh === 1 && mm === 0) jobs.push("job_send_review_reminders"); // 09:00 台灣
  if (hh === 10 && mm === 0) jobs.push("job_send_activity_reminders"); // 18:00 台灣

  for (const fn of jobs) {
    try {
      await runJob(env, fn);
    } catch {
      // runJob 內已 log；單支失敗不影響其餘與 outbox 消化
    }
  }

  // 每 15 分：檢查 app worker 的例外並在超標時寄信（未設定告警環境變數即略過）
  if (mm % 15 === 0) {
    try {
      await checkWorkerErrors(env, scheduledTime);
    } catch (e) {
      console.error(
        "[orchestrator] checkWorkerErrors 失敗：",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // 每 5 分：主動輪詢 app 的 /api/health（站台不通或 schema 漂移即寄信）。
  // 比 checkWorkerErrors 密，是因為它偵測的是「現在就掛著」而非「剛才錯過幾次」，
  // 而且零流量時段只有它抓得到。每天 288 次查詢，成本可忽略。
  if (mm % 5 === 0) {
    try {
      await checkAppHealth(env, scheduledTime);
    } catch (e) {
      console.error(
        "[orchestrator] checkAppHealth 失敗：",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  await drainOutbox(env);
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runScheduled(controller.scheduledTime, env));
  },

  // 手動測試入口（本機 `wrangler dev` 或臨時排錯用）；未設定 MANUAL_TRIGGER_SECRET
  // 一律拒絕，正式環境的實際觸發一律走上方 scheduled()。
  //   無參數                     → 消化 outbox
  //   ?job=job_xxx               → 觸發指定排程函式
  //   ?check=errors&minutes=180  → 立即查例外（可自訂區間，用來驗證告警是否暢通）
  //   ?check=health              → 立即輪詢 app 的 /api/health（異常且未在冷卻中會寄信）
  //   ?health=1                  → 回報本 worker 期望的 DB schema 版本與實際版本
  async fetch(req: Request, env: Env): Promise<Response> {
    const secret = env.MANUAL_TRIGGER_SECRET?.trim();
    if (!secret || req.headers.get("x-trigger-secret") !== secret) {
      return new Response("forbidden", { status: 403 });
    }
    const params = new URL(req.url).searchParams;

    // 部署漂移檢查：worker 與 DB 各自手動部署，版本可能對不上
    // （見 supabase/v2/43_schema_version.sql）。app 端另有 /api/health。
    if (params.get("health")) {
      const admin = adminClient(env);
      const { data, error } = await admin
        .from("system_settings")
        .select("schema_version")
        .maybeSingle();
      const dbSchema = error ? null : ((data?.schema_version as string) ?? null);
      return Response.json({
        ok: !error && dbSchema === EXPECTED_DB_SCHEMA,
        worker: { expectedDbSchema: EXPECTED_DB_SCHEMA },
        db: { reachable: !error, schemaVersion: dbSchema },
      });
    }
    if (params.get("check") === "health") {
      try {
        const result = await checkAppHealth(env, Date.now());
        return Response.json({ ok: true, ...result });
      } catch (e) {
        return Response.json(
          { ok: false, error: e instanceof Error ? e.message : String(e) },
          { status: 500 }
        );
      }
    }
    if (params.get("check") === "errors") {
      // 上限 24 小時：Analytics 查詢區間過長沒有意義，也避免誤打出巨量查詢。
      const minutes = Math.min(
        1440,
        Math.max(1, Number(params.get("minutes") ?? "15") || 15)
      );
      try {
        const result = await checkWorkerErrors(env, Date.now(), minutes);
        return Response.json({ ok: true, minutes, ...result });
      } catch (e) {
        return Response.json(
          { ok: false, error: e instanceof Error ? e.message : String(e) },
          { status: 500 }
        );
      }
    }
    const job = params.get("job");
    if (job && !ALLOWED_JOBS.has(job)) {
      return Response.json(
        { ok: false, error: `未知的排程：${job}` },
        { status: 400 }
      );
    }
    try {
      if (job) {
        await runJob(env, job);
        return Response.json({ ok: true, ran: job });
      }
      // 手動排乾時附上統計（含因寄信設定而跳過的筆數），方便驗證設定是否生效
      const result = await drainOutbox(env);
      return Response.json({ ok: true, ran: "drainOutbox", ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  },
};
