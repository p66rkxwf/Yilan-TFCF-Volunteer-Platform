"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { reviewVolunteerAccount, setVolunteerStatus } from "@/lib/actions/admin-users";
import type { VolunteerStatus } from "@/lib/types/database";

const STATUS_OPTIONS: { value: VolunteerStatus; label: string }[] = [
  { value: "active", label: "在職" },
  { value: "suspended", label: "停權" },
  { value: "graduated", label: "已畢業結案" },
];

export function VolunteerAccountActions({
  volunteerId,
  status,
  socialWorkers,
}: {
  volunteerId: string;
  status: VolunteerStatus;
  socialWorkers: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [assignedWorkerId, setAssignedWorkerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nextStatus, setNextStatus] = useState<VolunteerStatus>(
    status === "pending_review" || status === "rejected" ? "active" : status
  );

  const handleApprove = async () => {
    if (!assignedWorkerId) {
      toast.error("審核通過需指定負責社工。");
      return;
    }
    setIsSubmitting(true);
    const result = await reviewVolunteerAccount(volunteerId, true, assignedWorkerId);
    setIsSubmitting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("已核准帳號審核。");
    router.refresh();
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    const result = await reviewVolunteerAccount(volunteerId, false);
    setIsSubmitting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("已拒絕帳號審核。");
    router.refresh();
  };

  const handleStatusChange = async () => {
    if (nextStatus === status) return;
    setIsSubmitting(true);
    const result = await setVolunteerStatus(volunteerId, nextStatus as "active" | "suspended" | "graduated");
    setIsSubmitting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("已更新帳號狀態。");
    router.refresh();
  };

  if (status === "pending_review") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-amber-800">此帳號待審核，通過後才可報名活動。</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            className="w-full sm:w-56"
            triggerClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            menuClassName="bg-white"
            value={assignedWorkerId}
            ariaLabel="指派負責社工"
            onValueChange={setAssignedWorkerId}
            options={[
              { value: "", label: "選擇負責社工" },
              ...socialWorkers.map((w) => ({ value: w.id, label: w.full_name })),
            ]}
          />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              核准
            </button>
            <button
              onClick={handleReject}
              disabled={isSubmitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              拒絕
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return <p className="text-sm text-slate-500">此帳號審核未通過（終態，無法再變更）。</p>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        className="w-full sm:w-48"
        triggerClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        menuClassName="bg-white"
        value={nextStatus}
        ariaLabel="帳號狀態"
        onValueChange={(v) => setNextStatus(v as VolunteerStatus)}
        options={STATUS_OPTIONS}
      />
      <button
        onClick={handleStatusChange}
        disabled={isSubmitting || nextStatus === status}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        更新狀態
      </button>
    </div>
  );
}
