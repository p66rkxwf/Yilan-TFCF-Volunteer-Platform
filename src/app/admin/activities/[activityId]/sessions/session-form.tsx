"use client";

// 場次表單（新增／編輯共用）。起訖時間、名額、報名截止皆掛場次層。
// 時間改為使用者自行輸入文字（YYYY-MM-DD HH:mm）＋送出驗證，不再依賴瀏覽器日曆。
// 場次類型：正式（可報名）／行前說明會（純資訊、不可報名、不計時數）。
// 已結束場次禁改起訖（DB trigger 亦強制）；未給截止預設＝場次開始。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Panel } from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { formatTaipeiInput, parseTaipeiInput } from "@/lib/admin/datetime";
import type { ActivitySession, SessionType } from "@/lib/types/database";

const DATETIME_HINT = "格式：YYYY-MM-DD HH:mm（24 小時制），例如 2026-07-24 14:00";
const DATETIME_PLACEHOLDER = "2026-07-24 14:00";

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

  const [sessionType, setSessionType] = useState<SessionType>(session?.session_type ?? "regular");
  const [startText, setStartText] = useState(formatTaipeiInput(session?.start_at));
  const [endText, setEndText] = useState(formatTaipeiInput(session?.end_at));
  const [deadlineText, setDeadlineText] = useState(
    formatTaipeiInput(session?.registration_deadline_at)
  );
  const [capacity, setCapacity] = useState(String(session?.capacity ?? 10));
  const [location, setLocation] = useState(session?.location ?? "");
  const [note, setNote] = useState(session?.note ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{
    start?: string;
    end?: string;
    capacity?: string;
    deadline?: string;
  }>({});

  const isBriefing = sessionType === "briefing";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};

    // 起訖時間：格式 + 邏輯驗證
    const startIso = parseTaipeiInput(startText);
    const endIso = parseTaipeiInput(endText);
    if (!startText.trim()) nextErrors.start = "請輸入開始時間";
    else if (!startIso) nextErrors.start = "時間格式不正確（需 YYYY-MM-DD HH:mm）";
    if (!endText.trim()) nextErrors.end = "請輸入結束時間";
    else if (!endIso) nextErrors.end = "時間格式不正確（需 YYYY-MM-DD HH:mm）";
    if (startIso && endIso && endIso <= startIso) {
      nextErrors.end = "結束時間必須晚於開始時間";
    }

    // 名額與報名截止：僅正式場次適用
    let cap = 1;
    let deadlineIso = startIso ?? "";
    if (!isBriefing) {
      cap = Number(capacity);
      if (!Number.isInteger(cap) || cap <= 0) nextErrors.capacity = "名額需為正整數";
      if (deadlineText.trim()) {
        const parsed = parseTaipeiInput(deadlineText);
        if (!parsed) nextErrors.deadline = "時間格式不正確（需 YYYY-MM-DD HH:mm）";
        else deadlineIso = parsed;
      }
      if (startIso && deadlineIso && deadlineIso > startIso) {
        nextErrors.deadline = "報名截止不可晚於場次開始時間";
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    try {
      const loc = location.trim() || null;
      const noteVal = isBriefing ? note.trim() || null : null;

      if (isEdit && session) {
        // 已結束場次：DB 禁改起訖，故僅送可變欄位（名額、截止、地點、說明）
        const payload: Record<string, unknown> = { location: loc, note: noteVal };
        if (!isEnded) {
          payload.start_at = startIso;
          payload.end_at = endIso;
        }
        if (isBriefing) {
          // 說明會：名額固定 1、截止＝開始（皆為佔位，前台不使用）
          if (!isEnded) payload.registration_deadline_at = startIso;
        } else {
          payload.capacity = cap;
          payload.registration_deadline_at = deadlineIso;
        }
        const { error } = await supabase
          .from("activity_sessions")
          .update(payload)
          .eq("id", session.id);
        if (error) throw error;
        toast.success("場次已更新");
      } else {
        const { error } = await supabase.from("activity_sessions").insert({
          activity_id: activityId,
          start_at: startIso!,
          end_at: endIso!,
          capacity: isBriefing ? 1 : cap,
          registration_deadline_at: isBriefing ? startIso! : deadlineIso,
          session_type: sessionType,
          location: loc,
          note: noteVal,
        });
        if (error) throw error;
        toast.success(isBriefing ? "行前說明會已新增" : "場次已新增");
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
              此場次已結束，為保護時數計算的歷史正確性，起訖時間已鎖定，僅能調整名額、截止、地點與說明。
            </div>
          )}

          {isEdit ? (
            <Field label="場次類型">
              <p className="text-sm font-medium text-slate-700">
                {isBriefing ? "行前說明會（純資訊、不可報名）" : "正式場次（可報名）"}
                <span className="ml-2 text-xs text-slate-400">建立後不可變更類型</span>
              </p>
            </Field>
          ) : (
            <Field
              label="場次類型"
              hint="行前說明會為純資訊場次：志工不需（也無法）報名，也不計入服務時數。"
            >
              <Select
                value={sessionType}
                onValueChange={(v) => setSessionType(v as SessionType)}
                options={[
                  { value: "regular", label: "正式場次（可報名）" },
                  { value: "briefing", label: "行前說明會（僅公告）" },
                ]}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="開始時間" required error={errors.start} hint={DATETIME_HINT}>
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                placeholder={DATETIME_PLACEHOLDER}
                disabled={isEnded}
              />
            </Field>
            <Field label="結束時間" required error={errors.end} hint={DATETIME_HINT}>
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                value={endText}
                onChange={(e) => setEndText(e.target.value)}
                placeholder={DATETIME_PLACEHOLDER}
                disabled={isEnded}
              />
            </Field>
          </div>

          {!isBriefing && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="名額" required error={errors.capacity}>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </Field>
              <Field
                label="報名截止時間"
                error={errors.deadline}
                hint="留空＝可報名至場次開始時刻。格式同上。"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  value={deadlineText}
                  onChange={(e) => setDeadlineText(e.target.value)}
                  placeholder={DATETIME_PLACEHOLDER}
                />
              </Field>
            </div>
          )}

          <Field
            label="地點"
            hint="留空＝沿用活動的主要地點；填寫則此場次改於此地點。"
          >
            <input
              className={inputClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例：羅東鎮運動公園（留空沿用活動地點）"
              maxLength={120}
            />
          </Field>

          {isBriefing && (
            <Field label="說明" hint="選填。可填集合方式、線上連結、注意事項等，顯示於前台。">
              <textarea
                className={`${inputClass} min-h-24`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例：請於開始前 10 分鐘上線；連結 https://…"
              />
            </Field>
          )}
        </div>
      </Panel>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" isLoading={isSaving}>
          {isEdit ? "儲存變更" : isBriefing ? "新增行前說明會" : "新增場次"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </form>
  );
}
