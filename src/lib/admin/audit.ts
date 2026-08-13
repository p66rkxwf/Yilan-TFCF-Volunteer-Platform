// 操作紀錄的 detail（jsonb）判讀：把各 RPC/trigger 寫進 audit_logs.detail 的
// 原始鍵值翻成中文，供 /admin/logs 的「說明」欄與詳情對話框共用。
//
// detail 沒有固定 schema——每個 fn_audit 呼叫端各自 jsonb_build_object 想記的東西
// （見 supabase/v2/04_rpc_functions.sql、24_audit_expansion.sql 等）。這裡採
// 「認得的鍵給中文、認不得的原樣列出」策略：新增欄位不會消失，只是沒被翻譯。

import {
  ACTIVITY_STATUS,
  ANNOUNCEMENT_STATUS,
  CANCEL_REASON,
  CUSTOM_SERVICE_STATUS,
  GRADE_LEVELS,
  REGISTRATION_STATUS,
  STAFF_JOB_TITLE,
  STAFF_STATUS,
  SUPPORT_REQUEST_STATUS,
  VOLUNTEER_STATUS,
  type StatusMeta,
} from "@/lib/admin/labels";
import { formatDate, formatDateTime } from "@/lib/admin/datetime";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import type { GradeLevel } from "@/lib/types/database";

export type AuditDetail = Record<string, unknown> | null;

// detail 鍵 → 中文欄位名
const KEY_LABELS: Record<string, string> = {
  name: "名稱",
  title: "標題",
  label: "代號",
  full_name: "姓名",
  phone: "電話",
  email: "Email",
  old_email: "原 Email",
  username: "帳號",
  old_username: "原帳號",
  region: "地區",
  birth_date: "生日",
  grade: "學制",
  new_grade: "新學制",
  status: "狀態",
  new_status: "新狀態",
  old_status: "原狀態",
  from: "原狀態",
  to: "新狀態",
  job_title: "職稱",
  role: "角色",
  reason: "原因",
  note: "備註",
  cascade_cancelled: "連帶取消報名",
  moved_count: "移轉筆數",
  // 服務時數有兩種鍵名：出席計時走 service_hours，自訂服務審核走 hours
  service_hours: "服務時數",
  hours: "服務時數",
  is_pinned: "置頂",
  expected_release_at: "預計解除",
  new_release_at: "新解除時間",
  released_at: "實際解除",
  start_at: "開始",
  end_at: "結束",
  // 以下為關聯 uuid：摘要會略過（讀不出意義），但詳情對話框會逐列顯示，
  // 沒有標籤就會露出英文原鍵。
  activity_id: "所屬活動",
  session_id: "場次",
  registration_id: "報名",
  volunteer_id: "學生",
  worker_id: "負責社工",
  from_worker_id: "原負責社工",
  to_worker_id: "新負責社工",
  // manual_purge 的各類清除筆數
  archived: "封存清除",
  notifications: "通知清除",
  audit_logs: "稽核清除",
  registrations: "報名清除",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 狀態碼要查哪一本字典，取決於 action 而不只是鍵名：volunteer_cancel 的
// status 是「報名」狀態、update_volunteer_status 的 new_status 是「學生」狀態、
// activity_open 的 from/to 是「活動」狀態，而 rejected／cancelled 這些值在多本
// 字典裡都存在。先依 action 決定優先順序，再依序找。
function preferredStatusMap(action: string): Record<string, StatusMeta> {
  if (action.includes("announcement")) return ANNOUNCEMENT_STATUS;
  if (action.includes("custom_service")) return CUSTOM_SERVICE_STATUS;
  if (action.includes("support_request")) return SUPPORT_REQUEST_STATUS;
  if (action.includes("staff")) return STAFF_STATUS;
  if (action.startsWith("activity_") || action.includes("session")) return ACTIVITY_STATUS;
  if (
    action.includes("volunteer_status") ||
    action.includes("volunteer_account") ||
    action.includes("deactivation") ||
    action.includes("grade_review")
  ) {
    return VOLUNTEER_STATUS;
  }
  return REGISTRATION_STATUS;
}

function statusLabel(action: string, value: string): string | null {
  // 先查 action 對應的那本，再把其餘字典當退路：新 action 忘了歸類時仍翻得出來
  const maps: Record<string, StatusMeta>[] = [
    preferredStatusMap(action),
    REGISTRATION_STATUS,
    VOLUNTEER_STATUS,
    ACTIVITY_STATUS,
    ANNOUNCEMENT_STATUS,
    STAFF_STATUS,
    CUSTOM_SERVICE_STATUS,
    SUPPORT_REQUEST_STATUS,
  ];
  for (const map of maps) {
    if (value in map) return map[value].label;
  }
  return null;
}

const STATUS_KEYS = new Set(["status", "new_status", "old_status", "from", "to"]);

function translateValue(key: string, value: unknown, action: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    if (STATUS_KEYS.has(key)) {
      const label = statusLabel(action, value);
      if (label) return label;
    }
    // new_grade 與 grade 同型（年度審查記的是 new_grade）
    if (
      (key === "grade" || key === "new_grade") &&
      (GRADE_LEVELS as string[]).includes(value)
    ) {
      return GRADE_LEVEL_LABELS[value as GradeLevel];
    }
    if (key === "job_title" && value in STAFF_JOB_TITLE) {
      return STAFF_JOB_TITLE[value as keyof typeof STAFF_JOB_TITLE];
    }
    if (key === "reason" && value in CANCEL_REASON) {
      return CANCEL_REASON[value as keyof typeof CANCEL_REASON];
    }
    if (key === "birth_date") return formatDate(value);
    if (key.endsWith("_at")) return formatDateTime(value);
    // 裸 uuid（如 activity_id）沒有名稱可查，只給前 8 碼避免佔滿版面
    if (UUID_RE.test(value)) return value.slice(0, 8);
    return value;
  }

  return JSON.stringify(value);
}

export function auditKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? key;
}

// detail 攤平成「中文欄位 → 中文值」，供詳情對話框逐列顯示（不過濾任何鍵）。
export function auditDetailEntries(
  action: string,
  detail: AuditDetail
): { label: string; value: string }[] {
  if (!detail) return [];
  return Object.entries(detail).map(([key, value]) => ({
    label: auditKeyLabel(key),
    value: translateValue(key, value, action),
  }));
}

const NAME_KEYS = ["name", "title", "full_name", "label"] as const;

// detail 裡現成的對象名稱（多數 fn_audit 呼叫端都有記），供「對象」欄顯示，
// 省掉逐表反查 uuid。回傳來源鍵讓摘要能把它標記為已用，不重複列一次。
function findName(detail: AuditDetail): { key: string; value: string } | null {
  if (!detail) return null;
  for (const key of NAME_KEYS) {
    const value = detail[key];
    if (typeof value === "string" && value.trim()) return { key, value };
  }
  return null;
}

// 查不到回 null，呼叫端再退回 uuid 前 8 碼。
export function auditTargetName(detail: AuditDetail): string | null {
  return findName(detail)?.value ?? null;
}

// 表格「說明」欄的一句話摘要。先把最能說明「到底做了什麼」的鍵挑出來講清楚，
// 剩下沒被挑走的照樣列出去——否則像 admin_update_staff_profile 這種一次改 8 個
// 欄位的紀錄，只會顯示一個姓名，看不出究竟動了什麼。
export function summarizeAuditDetail(action: string, detail: AuditDetail): string {
  if (!detail || Object.keys(detail).length === 0) return "";

  const used = new Set<string>();
  const parts: string[] = [];
  const t = (key: string) => translateValue(key, detail[key], action);

  // 名稱/標題：加引號讓它在一串文字裡看得出邊界
  const named = findName(detail);
  if (named) {
    parts.push(`「${named.value}」`);
    used.add(named.key);
  }

  // 狀態轉移（activity_open 的 draft→open）與狀態變更
  if (typeof detail.from === "string" && typeof detail.to === "string") {
    parts.push(`${t("from")} → ${t("to")}`);
    used.add("from").add("to");
  } else if (typeof detail.new_status === "string") {
    if (typeof detail.old_status === "string") {
      parts.push(`${t("old_status")} → ${t("new_status")}`);
      used.add("old_status");
    } else {
      parts.push(`改為「${t("new_status")}」`);
    }
    used.add("new_status");
  } else if (typeof detail.status === "string") {
    parts.push(`狀態「${t("status")}」`);
    used.add("status");
  }

  if (typeof detail.cascade_cancelled === "number") {
    parts.push(
      detail.cascade_cancelled > 0
        ? `連帶取消 ${detail.cascade_cancelled} 筆報名`
        : "未連帶影響其他報名"
    );
    used.add("cascade_cancelled");
  }
  if (typeof detail.moved_count === "number") {
    parts.push(`移轉 ${detail.moved_count} 位學生`);
    used.add("moved_count");
  }
  if (typeof detail.service_hours === "number") {
    parts.push(`${detail.service_hours} 小時`);
    used.add("service_hours");
  }
  if (typeof detail.reason === "string" && detail.reason.trim()) {
    parts.push(`原因：${t("reason")}`);
    used.add("reason");
  }

  // 其餘鍵照列。純 uuid 關聯鍵（xxx_id）跳過——摘要裡讀不出意義，
  // 需要時在詳情對話框看得到。
  for (const key of Object.keys(detail)) {
    if (used.has(key) || key.endsWith("_id")) continue;
    parts.push(`${auditKeyLabel(key)}：${t(key)}`);
  }

  return parts.join("，");
}
