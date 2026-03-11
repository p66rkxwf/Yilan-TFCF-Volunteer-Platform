import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminLayoutClient } from "./admin-layout-client";

const ALLOWED_ROLES = ["system_admin", "unit_admin", "internal_staff"];

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, position")
    .eq("id", user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    redirect("/");
  }

  return (
    <AdminLayoutClient profile={profile}>
      {children}
    </AdminLayoutClient>
  );
}
