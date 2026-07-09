"use server";

// 封存（軟刪，可復原）／還原／立即清除。限系統管理員（RPC 內強制）。
// 帳號類（志工/職員）封存時一併停用 Auth 登入（ban）；還原時解除。
// 資料表白名單與權限由 rpc_archive_record / rpc_restore_record / rpc_purge_now 強制（見 23）。

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/cached-auth";

interface ActionResult {
  error?: string;
  success?: boolean;
}

export type ArchivableTable =
  | "volunteer_profiles"
  | "staff_profiles"
  | "activities"
  | "announcements";

const ACCOUNT_TABLES: ArchivableTable[] = ["volunteer_profiles", "staff_profiles"];

export async function archiveRecord(
  table: ArchivableTable,
  id: string
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_archive_record", { p_table: table, p_id: id });
  if (error) return { error: error.message };

  // 帳號類：封存＝停用登入（既有 token 也失效）。
  if (ACCOUNT_TABLES.includes(table)) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  }
  return { success: true };
}

export async function restoreRecord(
  table: ArchivableTable,
  id: string
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_restore_record", { p_table: table, p_id: id });
  if (error) return { error: error.message };

  if (ACCOUNT_TABLES.includes(table)) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  }
  return { success: true };
}

// 單筆永久刪除（不可復原）。FK 連鎖與權限由 rpc_delete_record 強制（見 26）；
// 帳號類另刪 Auth 使用者（登入帳號徹底移除）。
export async function deleteRecordPermanently(
  table: ArchivableTable,
  id: string
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_delete_record", { p_table: table, p_id: id });
  if (error) return { error: error.message };

  if (ACCOUNT_TABLES.includes(table)) {
    const admin = createAdminClient();
    const { error: authDelError } = await admin.auth.admin.deleteUser(id);
    if (authDelError) {
      return { success: true, error: `資料已刪除，但登入帳號移除失敗：${authDelError.message}` };
    }
  }
  return { success: true };
}

export interface PurgeCounts {
  archived: number;
  notifications: number;
  audit_logs: number;
  registrations: number;
}

export async function purgeNow(): Promise<ActionResult & { counts?: PurgeCounts }> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { data, error } = await supabase.rpc("rpc_purge_now");
  if (error) return { error: error.message };
  return { success: true, counts: data as PurgeCounts };
}
