"use server";

import { createClient } from "@/lib/supabase/server";
import type { Registration } from "@/lib/types/database";

interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function registerForActivity(
  activityId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "請先登入。" };

  const { data: existing } = await supabase
    .from("registrations")
    .select("id, status")
    .eq("activity_id", activityId)
    .eq("volunteer_id", user.id)
    .in("status", ["pending", "approved"])
    .single();

  if (existing) return { error: "您已報名此活動。" };

  const { count } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("activity_id", activityId)
    .in("status", ["pending", "approved"]);

  const { data: activity } = await supabase
    .from("activities")
    .select("capacity, is_cancelled")
    .eq("id", activityId)
    .single();

  if (!activity) return { error: "活動不存在。" };
  if (activity.is_cancelled) return { error: "此活動已取消。" };
  if ((count ?? 0) >= activity.capacity) return { error: "名額已滿。" };

  const { error } = await supabase.from("registrations").insert({
    activity_id: activityId,
    volunteer_id: user.id,
    status: "pending",
  });

  if (error) return { error: `報名失敗：${error.message}` };

  return { success: true };
}

export async function cancelRegistration(
  activityId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "請先登入。" };

  const { error } = await supabase
    .from("registrations")
    .update({ status: "cancelled" })
    .eq("activity_id", activityId)
    .eq("volunteer_id", user.id)
    .in("status", ["pending", "approved"]);

  if (error) return { error: `取消失敗：${error.message}` };

  return { success: true };
}

export async function getMyRegistrations(): Promise<
  (Registration & { activity_title?: string })[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("registrations")
    .select("*, activities(title)")
    .eq("volunteer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    data?.map((r) => ({
      ...r,
      activity_title: (r.activities as unknown as { title: string })?.title,
    })) ?? []
  );
}
