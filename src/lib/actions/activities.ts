"use server";

import { createClient } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types/database";

export interface ActivityWithSlots extends Activity {
  registered_count: number;
  spots_left: number;
}

export async function getActivities(): Promise<ActivityWithSlots[]> {
  const supabase = await createClient();

  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .or("is_cancelled.eq.false,is_cancelled.is.null")
    .order("activity_date", { ascending: true });

  if (!activities) return [];

  const activitiesWithSlots: ActivityWithSlots[] = await Promise.all(
    activities.map(async (activity) => {
      const { count } = await supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("activity_id", activity.id)
        .in("status", ["pending", "approved"]);

      const registered_count = count ?? 0;
      return {
        ...activity,
        registered_count,
        spots_left: activity.capacity - registered_count,
      };
    })
  );

  return activitiesWithSlots;
}

export async function getActivity(
  id: string
): Promise<ActivityWithSlots | null> {
  const supabase = await createClient();

  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .single();

  if (!activity) return null;

  const { count } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("activity_id", activity.id)
    .in("status", ["pending", "approved"]);

  const registered_count = count ?? 0;

  return {
    ...activity,
    registered_count,
    spots_left: activity.capacity - registered_count,
  };
}
