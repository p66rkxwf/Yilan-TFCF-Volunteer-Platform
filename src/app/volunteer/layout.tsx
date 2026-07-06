// /volunteer 與 /volunteer/[activityId] 的門檻：
// 審核中（pending_review）與審核未通過（rejected）的志工不得瀏覽平台資料，
// 一律導到帳號審核狀態頁。職員與其餘狀態志工放行。

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function VolunteerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/volunteer");

  const { data: volunteer } = await supabase
    .from("volunteer_profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    volunteer &&
    (volunteer.status === "pending_review" || volunteer.status === "rejected")
  ) {
    redirect("/account-review");
  }

  return <>{children}</>;
}
