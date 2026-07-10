"use client";

import { PageHeader } from "@/components/admin/ui";
import { useAdminProfile } from "../../admin-context";
import { ActivityForm } from "../activity-form";

export default function NewActivityPage() {
  const profile = useAdminProfile();

  return (
    <>
      <PageHeader
        title="新增活動"

        backHref="/admin/activities"
        backLabel="活動管理"
      />
      <div className="flex-1 p-4 sm:p-6">
        <ActivityForm currentUserId={profile.id} />
      </div>
    </>
  );
}
