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
// 併發備註：假設由單一排程每分鐘觸發、批量 50 筆、單次執行遠短於 1 分鐘，
//   故不做 FOR UPDATE SKIP LOCKED 佇列鎖；更新皆帶 .eq('status','pending') 作樂觀防護。
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
}

const BATCH_SIZE = 50;
const DEFAULT_MAIL_FROM = "宜蘭家扶志工平台 <noreply@example.org>";

interface OutboxRow {
  id: string;
  recipient_user_id: string;
  notification_type: string;
  payload: Record<string, unknown>;
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

function formatTW(value: unknown): string {
  if (typeof value !== "string") return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
    hourCycle: "h23",
  }).format(d);
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
    default:
      return "您在志工平台有一則新通知。";
  }
}

function renderTemplate(
  type: string,
  payload: Record<string, unknown>,
  name: string,
  siteUrl: string
): { subject: string; html: string; text: string } {
  const subject = SUBJECTS[type] ?? "志工平台通知";
  const greeting = name ? `${name} 您好：` : "您好：";
  const when = formatTW(payload?.["start_at"]);
  const whenLine = when ? `活動時間：${when}` : "";
  const cta = siteUrl || "";

  const textParts = [
    greeting,
    "",
    lead(type),
    whenLine,
    "",
    cta ? `請登入平台查看詳情：${cta}` : "請登入平台查看詳情。",
    "",
    "— 宜蘭家扶中心志工平台（此為系統自動通知，請勿直接回覆）",
  ].filter((l) => l !== "");
  const text = textParts.join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;font-size:15px;color:#0f172a;line-height:1.7">
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(lead(type))}</p>
  ${when ? `<p style="color:#475569">活動時間：${escapeHtml(when)}</p>` : ""}
  <p>${cta ? `請<a href="${escapeHtml(cta)}" style="color:#2563eb">登入平台</a>查看詳情。` : "請登入平台查看詳情。"}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
  <p style="color:#94a3b8;font-size:12px">宜蘭家扶中心志工平台 · 此為系統自動通知，請勿直接回覆</p>
</div>`;

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

async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

// 消化 notification_outbox：讀 pending → 解析收件者 → 組信 → Resend 寄出 → 更新狀態
export async function drainOutbox(
  env: Env
): Promise<{ processed: number; sent: number; failed: number }> {
  if (!env.RESEND_API_KEY) {
    console.warn("[orchestrator] RESEND_API_KEY 未設定，略過 outbox 消化");
    return { processed: 0, sent: 0, failed: 0 };
  }

  const admin = adminClient(env);
  const siteUrl = (env.SITE_URL ?? "").replace(/\/+$/, "");

  const { data: pending, error } = await admin
    .from("notification_outbox")
    .select("id, recipient_user_id, notification_type, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw new Error(`讀取 outbox 失敗：${error.message}`);
  if (!pending || pending.length === 0) return { processed: 0, sent: 0, failed: 0 };

  const rows = pending as OutboxRow[];
  const recipients = await resolveRecipients(
    admin,
    [...new Set(rows.map((r) => r.recipient_user_id))]
  );

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const rec = recipients.get(row.recipient_user_id);
      if (!rec?.email) throw new Error("找不到收件者 email");
      const tmpl = renderTemplate(
        row.notification_type,
        row.payload ?? {},
        rec.name,
        siteUrl
      );
      await sendEmail(env, rec.email, tmpl.subject, tmpl.html, tmpl.text);
      await admin
        .from("notification_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id)
        .eq("status", "pending");
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin
        .from("notification_outbox")
        .update({ status: "failed", error: message.slice(0, 500) })
        .eq("id", row.id)
        .eq("status", "pending");
      failed++;
    }
  }

  console.log(
    `[orchestrator] outbox processed=${rows.length} sent=${sent} failed=${failed}`
  );
  return { processed: rows.length, sent, failed };
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
  if (hh === 1 && mm === 0) jobs.push("job_send_review_reminders"); // 09:00 台灣
  if (hh === 10 && mm === 0) jobs.push("job_send_activity_reminders"); // 18:00 台灣

  for (const fn of jobs) {
    try {
      await runJob(env, fn);
    } catch {
      // runJob 內已 log；單支失敗不影響其餘與 outbox 消化
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
  //   無參數        → 消化 outbox
  //   ?job=job_xxx  → 觸發指定排程函式
  async fetch(req: Request, env: Env): Promise<Response> {
    const secret = env.MANUAL_TRIGGER_SECRET?.trim();
    if (!secret || req.headers.get("x-trigger-secret") !== secret) {
      return new Response("forbidden", { status: 403 });
    }
    const job = new URL(req.url).searchParams.get("job");
    try {
      if (job) await runJob(env, job);
      else await drainOutbox(env);
      return Response.json({ ok: true, ran: job ?? "drainOutbox" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  },
};
