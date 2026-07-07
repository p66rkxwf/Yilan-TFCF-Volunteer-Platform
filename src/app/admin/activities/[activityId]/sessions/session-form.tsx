"use client";

// 場次表單（新增／編輯共用）。起訖時間、名額、報名截止皆掛場次層。
// 已結束場次禁改起訖（DB trigger 亦強制）；未給截止預設＝場次開始。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Panel } from "@/components/admin/ui";
import { isoToTaipeiLocal, taipeiLocalToIso } from "@/lib/admin/datetime";
import type { ActivitySession } from "@/lib/types/database";

export function SessionForm({
  activityId,
  session,
}: {
  activityId: string;
  session?: ActivitySession;
}) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const isEdit = Boolean(session);
  const isEnded = session ? session.end_at <= new Date().toISOString() : false;

  const [startLocal, setStartLocal] = useState(isoToTaipeiLocal(session?.start_at));
  const [endLocal, setEndLocal] = useState(isoToTaipeiLocal(session?.end_at));
  const [deadlineLocal, setDeadlineLocal] = useState(
    isoToTaipeiLocal(session?.registration_deadline_at)
  );
  const [capacity, setCapacity] = useState(String(session?.capacity ?? 10));
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startLocal || !endLocal) return void toast.error("請填寫場次起訖時間");
    const startIso = taipeiLocalToIso(startLocal);
    const endIso = taipeiLocalToIso(endLocal);
    if (endIso <= startIso) return void toast.error("結束時間必須晚於開始時間");

    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) return void toast.error("名額需為正整數");

    const deadlineIso = deadlineLocal ? taipeiLocalToIso(deadlineLocal) : startIso;
    if (deadlineIso > startIso) return void toast.error("報名截止不可晚於場次開始時間");

    setIsSaving(true);
    try {
      if (isEdit && session) {
        // 已結束場次：DB 禁改起訖，這裡只送名額與截止（保留原起訖以免觸發保護）
        const payload = isEnded
          ? { capacity: cap, registration_deadline_at: deadlineIso }
          : {
              start_at: startIso,
              end_at: endIso,
              capacity: cap,
              registration_deadline_at: deadlineIso,
            };
        const { error } = await supabase
          .from("activity_sessions")
          .update(payload)
          .eq("id", session.id);
        if (error) throw error;
        toast.success("場次已更新");
      } else {
        const { error } = await supabase.from("activity_sessions").insert({
          activity_id: activityId,
          start_at: startIso,
          end_at: endIso,
          capacity: cap,
          registration_deadline_at: deadlineIso,
        });
        if (error) throw error;
        toast.success("場次已新增");
      }
      router.push(`/admin/activities/${activityId}`);
      router.refresh();
    } catch (error) {
      toast.error(`儲存失敗：${getErrorMessage(error as Error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <Panel>
        <div className="space-y-4">
          {isEnded && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              此場次已結束，為保護時數計算的歷史正確性，起訖時間已鎖定，僅能調整名額與截止。
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="開始時間" required>
              <input
                type="datetime-local"
                className={inputClass}
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                disabled={isEnded}
              />
            </Field>
            <Field label="結束時間" required>
              <input
                type="datetime-local"
                className={inputClass}
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                disabled={isEnded}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="名額" required>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
            <Field label="報名截止時間" hint="留空＝可報名至場次開始時刻。">
              <input
                type="datetime-local"
                className={inputClass}
                value={deadlineLocal}
                onChange={(e) => setDeadlineLocal(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" isLoading={isSaving}>
          {isEdit ? "儲存變更" : "新增場次"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </form>
  );
}
