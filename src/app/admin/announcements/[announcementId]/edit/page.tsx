"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/admin/ui";
import { useAdminProfile } from "../../../admin-context";
import { AnnouncementForm } from "../../announcement-form";
import type { Announcement } from "@/lib/types/database";

export default function EditAnnouncementPage() {
  const { announcementId } = useParams<{ announcementId: string }>();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const profile = useAdminProfile();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", announcementId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("找不到此公告");
        router.push("/admin/announcements");
        return;
      }
      setAnnouncement(data as Announcement);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcementId]);

  return (
    <>
      <PageHeader
        title="編輯公告"
        backHref="/admin/announcements"
        backLabel="公告管理"
      />
      <div className="flex-1 p-4 sm:p-6">
        {announcement ? (
          <AnnouncementForm announcement={announcement} currentUserId={profile.id} />
        ) : (
          <p className="text-sm text-slate-400">資料載入中…</p>
        )}
      </div>
    </>
  );
}
