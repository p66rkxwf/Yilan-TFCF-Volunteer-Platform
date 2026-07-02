"use server";

import { createClient } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types/database";

export interface ActivityWithSlots extends Activity {
  registered_count: number;
  spots_left: number;
}

export async function getActivities(): Promise<ActivityWithSlots[]> {
  const supabase = await createClient();

  const [{ data: activities }, { data: counts }] = await Promise.all([
    supabase
      .from("activities")
      .select("*")
      .or("is_cancelled.eq.false,is_cancelled.is.null")
      .order("activity_date", { ascending: true }),
    supabase.from("activity_registration_counts").select("activity_id, registered_count"),
  ]);

  if (!activities) return [];

  const countByActivityId = new Map<string, number>(
    (counts ?? []).map((c) => [c.activity_id, c.registered_count])
  );

  return activities.map((activity) => {
    const registered_count = countByActivityId.get(activity.id) ?? 0;
    return {
      ...activity,
      registered_count,
      spots_left: activity.capacity - registered_count,
    };
  });
}

export async function getActivity(
  id: string
): Promise<ActivityWithSlots | null> {
  const supabase = await createClient();

  const [{ data: activity }, { data: countRow }] = await Promise.all([
    supabase.from("activities").select("*").eq("id", id).single(),
    supabase
      .from("activity_registration_counts")
      .select("registered_count")
      .eq("activity_id", id)
      .maybeSingle(),
  ]);

  if (!activity) return null;

  const registered_count = countRow?.registered_count ?? 0;

  return {
    ...activity,
    registered_count,
    spots_left: activity.capacity - registered_count,
  };
}
