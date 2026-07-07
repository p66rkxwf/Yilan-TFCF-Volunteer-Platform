"use client";

import { PageHeader } from "@/components/admin/ui";
import { useAdminProfile } from "../../admin-context";
import { AnnouncementForm } from "../announcement-form";

export default function NewAnnouncementPage() {
  const profile = useAdminProfile();

  return (
    <>
      <PageHeader
        title="新增公告"
        description="可直接發布或先儲存為草稿。"
        backHref="/admin/announcements"
        backLabel="公告管理"
      />
      <div className="flex-1 p-4 sm:p-6">
        <AnnouncementForm currentUserId={profile.id} />
      </div>
    </>
  );
}
