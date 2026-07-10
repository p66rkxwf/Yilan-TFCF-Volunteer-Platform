"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/admin/ui";
import { useAdminProfile } from "../../../admin-context";
import { ActivityForm } from "../../activity-form";
import type { Activity } from "@/lib/types/database";

export default function EditActivityPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const profile = useAdminProfile();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [organizerIds, setOrganizerIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [activityRes, organizersRes] = await Promise.all([
        supabase.from("activities").select("*").eq("id", activityId).maybeSingle(),
        supabase.from("activity_organizers").select("staff_id").eq("activity_id", activityId),
      ]);
      if (cancelled) return;
      if (activityRes.error || !activityRes.data) {
        toast.error("找不到此活動");
        router.push("/admin/activities");
        return;
      }
      setActivity(activityRes.data as Activity);
      setOrganizerIds(((organizersRes.data ?? []) as { staff_id: string }[]).map((o) => o.staff_id));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  return (
    <>
      <PageHeader
        title={activity ? `編輯：${activity.title}` : "編輯活動"}

        backHref={`/admin/activities/${activityId}`}
        backLabel="活動詳情"
      />
      <div className="flex-1 p-4 sm:p-6">
        {activity && organizerIds ? (
          <ActivityForm
            activity={activity}
            initialOrganizerIds={organizerIds}
            currentUserId={profile.id}
          />
        ) : (
          <p className="text-sm text-slate-400">資料載入中…</p>
        )}
      </div>
    </>
  );
}
