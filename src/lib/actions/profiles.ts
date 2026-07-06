"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-auth";
import type { VolunteerProfile } from "@/lib/types/database";

export async function getProfile(): Promise<VolunteerProfile | null> {
  const supabase = await createClient();
  const user = await getCachedUser();

  if (!user) return null;

  const { data } = await supabase
    .from("volunteer_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}
