// ⚠️ DEPRECATED（已停用，僅留作參考）
// 本專案已改以 Cloudflare Cron Worker 消化 notification_outbox 並觸發背景排程，
// 見 workers/orchestrator/（邏輯自本檔移植）。不再部署此 Supabase Edge Function，
// pg_cron/pg_net 觸發也已移除（見 supabase/v2/12_enable_scheduled_jobs.sql）。
// 保留本檔僅供比對／回溯，請勿再 `supabase functions deploy send-notifications`。
//
// Supabase Edge Function：notification_outbox 發信 worker（Transactional Outbox 消費端）
//
// 職責：讀取 status='pending' 的通知 → 解析收件者 email → 依 notification_type 組信
//       → 透過 Resend 寄出 → 更新該列 status 為 'sent'（失敗記 'failed' + error）。
//
// 部署：
//   supabase functions deploy send-notifications
//   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM='宜蘭家扶志工平台 <noreply@你的網域>' \
//                        SITE_URL=https://你的網域 WORKER_SECRET=<自訂隨機字串>
//   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自動注入）
// 觸發：見 supabase/v2/12_enable_scheduled_jobs.sql（pg_cron + pg_net 每分鐘呼叫本函式）
//
// 併發備註：假設由單一排程每分鐘觸發、批量 50 筆、單次執行遠短於 1 分鐘，
// 故不做 FOR UPDATE SKIP LOCKED 佇列鎖；更新皆帶 .eq('status','pending') 作樂觀防護。
// 若日後量大，可加 'sending' 狀態或 attempts 欄位強化。

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const MAIL_FROM =
  Deno.env.get("MAIL_FROM") ?? "宜蘭家扶志工平台 <noreply@example.org>";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
const WORKER_SECRET = Deno.env.get("WORKER_SECRET");
const BATCH_SIZE = 50;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface OutboxRow {
  id: string;
  recipient_user_id: string;
  notification_type: string;
  payload: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
  name: string
): { subject: string; html: string; text: string } {
  const subject = SUBJECTS[type] ?? "志工平台通知";
  const greeting = name ? `${name} 您好：` : "您好：";
  const when = formatTW(payload?.["start_at"]);
  const whenLine = when ? `活動時間：${when}` : "";
  const cta = SITE_URL || "";

  const textParts = [greeting, "", lead(type), whenLine, "", cta ? `請登入平台查看詳情：${cta}` : "請登入平台查看詳情。", "", "— 宜蘭家扶中心志工平台（此為系統自動通知，請勿直接回覆）"].filter((l) => l !== "");
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
    const email = data?.user?.email;
    if (email) {
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      map.set(id, { email, name: (meta.full_name as string) ?? "" });
    }
  }
  return map;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (WORKER_SECRET && req.headers.get("x-worker-secret") !== WORKER_SECRET) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  if (!RESEND_API_KEY) {
    return json({ ok: false, error: "RESEND_API_KEY 未設定" }, 500);
  }

  const { data: pending, error } = await admin
    .from("notification_outbox")
    .select("id, recipient_user_id, notification_type, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return json({ ok: false, error: error.message }, 500);
  if (!pending || pending.length === 0) return json({ ok: true, processed: 0 });

  const rows = pending as OutboxRow[];
  const recipients = await resolveRecipients([
    ...new Set(rows.map((r) => r.recipient_user_id)),
  ]);

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const rec = recipients.get(row.recipient_user_id);
      if (!rec?.email) throw new Error("找不到收件者 email");
      const tmpl = renderTemplate(row.notification_type, row.payload ?? {}, rec.name);
      await sendEmail(rec.email, tmpl.subject, tmpl.html, tmpl.text);
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

  return json({ ok: true, processed: rows.length, sent, failed });
});
