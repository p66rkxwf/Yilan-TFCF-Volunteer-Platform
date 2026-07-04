"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { reviewDeactivationRequest } from "@/lib/actions/deactivation";
import type { DeactivationRequest } from "@/lib/types/database";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

export function DeactivationReviewPanel({
  request,
}: {
  request: DeactivationRequest;
}) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState<boolean | null>(null);

  const handleReview = async () => {
    if (confirmApprove === null) return;
    setIsSubmitting(true);

    const result = await reviewDeactivationRequest(request.id, confirmApprove, note.trim() || undefined);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(confirmApprove ? "已核准停用申請。" : "已駁回停用申請。");
      router.refresh();
    }
    setIsSubmitting(false);
    setConfirmApprove(null);
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-red-800">
          此志工於 {DATE_TIME_FORMATTER.format(new Date(request.created_at))} 提出停用申請，待處理。
        </p>
        {request.reason ? (
          <p className="mt-1 text-sm text-red-700">申請原因：{request.reason}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700">審核備註（選填）</label>
        <textarea
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirmApprove(true)}
          disabled={isSubmitting}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          核准停用
        </button>
        <button
          onClick={() => setConfirmApprove(false)}
          disabled={isSubmitting}
          className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          駁回
        </button>
      </div>

      <ConfirmDialog
        open={confirmApprove !== null}
        title={confirmApprove ? "確定核准此停用申請嗎？" : "確定駁回此停用申請嗎？"}
        description={
          confirmApprove
            ? "核准後該志工帳號將轉為停權，未開始的已核准報名會一併取消。"
            : "駁回後該志工帳號維持在職，申請人可再次提出申請。"
        }
        confirmText={confirmApprove ? "核准停用" : "駁回"}
        cancelText="取消"
        isConfirmDanger={!!confirmApprove}
        isLoading={isSubmitting}
        onClose={() => {
          if (isSubmitting) return;
          setConfirmApprove(null);
        }}
        onConfirm={handleReview}
      />
    </div>
  );
}
