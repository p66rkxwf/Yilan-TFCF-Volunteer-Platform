import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileLayoutClient } from "./profile-layout-client";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/profile");

  // V2 沒有單一 profiles 表：先查志工（此頁面主要使用者），
  // 查不到再查職員（V1 允許任何已登入使用者查看 /profile）。
  const { data: volunteer } = await supabase
    .from("volunteer_profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const profile =
    volunteer ??
    (
      await supabase
        .from("staff_profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle()
    ).data;

  return (
    <ProfileLayoutClient
      profile={profile || { full_name: "使用者", email: "" }}
    >
      {children}
    </ProfileLayoutClient>
  );
}
