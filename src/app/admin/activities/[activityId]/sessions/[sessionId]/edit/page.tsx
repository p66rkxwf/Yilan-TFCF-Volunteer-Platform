"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/admin/ui";
import { SessionForm } from "../../session-form";
import type { ActivitySession } from "@/lib/types/database";

export default function EditSessionPage() {
  const { activityId, sessionId } = useParams<{ activityId: string; sessionId: string }>();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const [session, setSession] = useState<ActivitySession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("activity_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("找不到此場次");
        router.push(`/admin/activities/${activityId}`);
        return;
      }
      setSession(data as ActivitySession);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <>
      <PageHeader
        title="編輯場次"

        backHref={`/admin/activities/${activityId}`}
        backLabel="活動詳情"
      />
      <div className="flex-1 p-4 sm:p-6">
        {session ? (
          <SessionForm activityId={activityId} session={session} />
        ) : (
          <p className="text-sm text-slate-400">資料載入中…</p>
        )}
      </div>
    </>
  );
}
