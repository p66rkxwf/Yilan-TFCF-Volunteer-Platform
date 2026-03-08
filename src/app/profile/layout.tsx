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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  return (
    <ProfileLayoutClient
      profile={profile || { full_name: "使用者", email: "" }}
    >
      {children}
    </ProfileLayoutClient>
  );
}
