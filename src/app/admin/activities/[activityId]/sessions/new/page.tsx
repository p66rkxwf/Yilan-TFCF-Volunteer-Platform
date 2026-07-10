"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/ui";
import { SessionForm } from "../session-form";
import { SessionBatchForm } from "../session-batch-form";

type Mode = "single" | "batch";

export default function NewSessionPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const [mode, setMode] = useState<Mode>("single");

  return (
    <>
      <PageHeader
        title="新增場次"

        backHref={`/admin/activities/${activityId}`}
        backLabel="活動詳情"
      />
      <div className="flex-1 p-4 sm:p-6">
        <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              mode === "single" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            單一場次
          </button>
          <button
            type="button"
            onClick={() => setMode("batch")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              mode === "batch" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            一次新增多場次
          </button>
        </div>

        {mode === "single" ? (
          <SessionForm activityId={activityId} />
        ) : (
          <SessionBatchForm activityId={activityId} />
        )}
      </div>
    </>
  );
}
