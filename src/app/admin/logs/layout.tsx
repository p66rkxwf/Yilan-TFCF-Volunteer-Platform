import { redirect } from "next/navigation";
import { getCachedUser, getCachedIdentity } from "@/lib/supabase/cached-auth";

// 縱深防禦：操作紀錄僅系統管理員可讀。父層 admin/layout 只保證「在職職員」，
// 故此處於伺服器端再確認 system_admin，非此角色直接導回 /admin（不倚賴前端
// sidebar 隱藏或 RLS 回空）。RLS 仍是資料層的最終防線。
export default async function AdminLogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?redirect=/admin/logs");

  const identity = await getCachedIdentity(user.id);
  if (
    identity?.kind !== "staff" ||
    identity.role !== "system_admin" ||
    identity.status !== "active"
  ) {
    redirect("/admin");
  }

  return <>{children}</>;
}
