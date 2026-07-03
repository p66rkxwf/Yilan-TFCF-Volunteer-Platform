import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminLayoutClient } from "./admin-layout-client";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/admin");

  // V2 沒有單一 role 欄位：只要在 staff_profiles 裡且在職即可進後台
  // （V1 的 ALLOWED_ROLES 本就涵蓋所有職員角色）；更細緻的權限
  // （system_admin / unit_admin 專屬操作）交由各頁面的 RPC/RLS 再檢查。
  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, full_name, email, role, job_title, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    redirect("/");
  }

  return (
    <AdminLayoutClient profile={profile}>
      {children}
    </AdminLayoutClient>
  );
}
