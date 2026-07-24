"use client";

// 場次表單（新增／編輯共用）。起訖時間、名額、報名截止皆掛場次層。
// 時間改為使用者自行輸入文字（日期 YYYY-MM-DD ＋ 時間 HH:mm 分開兩欄）＋送出驗證，
// 不再依賴瀏覽器日曆。
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
import { isoToTaipeiLocal, normalizeDateInput, normalizeTimeInput, taipeiLocalToIso } from "@/lib/admin/datetime";
import type { ActivitySession, SessionType } from "@/lib/types/database";

const DATE_PLACEHOLDER = "2026-07-24";
const TIME_PLACEHOLDER = "14:00";

function splitTaipeiIso(iso: string | null | undefined): { date: string; time: string } {
  const local = isoToTaipeiLocal(iso);
  if (!local) return { date: "", time: "" };
  const [date, time] = local.split("T");
  return { date, time };
}

// 日期＋時間分兩欄輸入的欄位（Field 的變體：單一 label 對應兩個獨立 input，
// 各自以 aria-label 標示，錯誤/提示訊息顯示於兩欄下方）。
function DateTimeField({
  label,
  required,
  error,
  hint,
  dateValue,
  onDateChange,
  timeValue,
  onTimeChange,
  disabled,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  dateValue: string;
  onDateChange: (v: string) => void;
  timeValue: string;
  onTimeChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-slate-400">*</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          className={`${inputClass} flex-1`}
          value={dateValue}
          onChange={(e) => onDateChange(e.target.value)}
          placeholder={DATE_PLACEHOLDER}
          aria-label={`${label} - 日期`}
          disabled={disabled}
        />
        <input
          type="text"
          inputMode="numeric"
          className={`${inputClass} w-24`}
          value={timeValue}
          onChange={(e) => onTimeChange(e.target.value)}
          placeholder={TIME_PLACEHOLDER}
          aria-label={`${label} - 時間`}
          disabled={disabled}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

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

  const initialStart = splitTaipeiIso(session?.start_at);
  const initialEnd = splitTaipeiIso(session?.end_at);
  const initialDeadline = splitTaipeiIso(session?.registration_deadline_at);
  const [startDate, setStartDate] = useState(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);

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

    // 開始時間：日期＋時間需一併填寫、格式正確
    const normStartDate = normalizeDateInput(startDate);
    const normStartTime = normalizeTimeInput(startTime);
    if (!startDate.trim() || !startTime.trim()) {
      nextErrors.start = "請輸入開始日期與時間";
    } else if (!normStartDate || !normStartTime) {
      nextErrors.start = "開始日期或時間格式不正確";
    }
    const startIso =
      normStartDate && normStartTime ? taipeiLocalToIso(`${normStartDate}T${normStartTime}`) : null;

    // 結束時間
    const normEndDate = normalizeDateInput(endDate);
    const normEndTime = normalizeTimeInput(endTime);
    if (!endDate.trim() || !endTime.trim()) {
      nextErrors.end = "請輸入結束日期與時間";
    } else if (!normEndDate || !normEndTime) {
      nextErrors.end = "結束日期或時間格式不正確";
    }
    const endIso = normEndDate && normEndTime ? taipeiLocalToIso(`${normEndDate}T${normEndTime}`) : null;

    if (startIso && endIso && endIso <= startIso) {
      nextErrors.end = "結束時間必須晚於開始時間";
    }

    // 名額與報名截止：僅正式場次適用
    let cap = 1;
    let deadlineIso = startIso ?? "";
    if (!isBriefing) {
      cap = Number(capacity);
      if (!Number.isInteger(cap) || cap <= 0) nextErrors.capacity = "名額需為正整數";

      const deadlineFilled = deadlineDate.trim() || deadlineTime.trim();
      if (deadlineFilled) {
        const normDeadlineDate = normalizeDateInput(deadlineDate);
        const normDeadlineTime = normalizeTimeInput(deadlineTime);
        if (!deadlineDate.trim() || !deadlineTime.trim()) {
          nextErrors.deadline = "報名截止的日期與時間請一併填寫，或兩者都留空";
        } else if (!normDeadlineDate || !normDeadlineTime) {
          nextErrors.deadline = "報名截止日期或時間格式不正確";
        } else {
          deadlineIso = taipeiLocalToIso(`${normDeadlineDate}T${normDeadlineTime}`);
        }
      }
      if (!nextErrors.deadline && startIso && deadlineIso && deadlineIso > startIso) {
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
            <DateTimeField
              label="開始時間"
              required
              error={errors.start}
              dateValue={startDate}
              onDateChange={setStartDate}
              timeValue={startTime}
              onTimeChange={setStartTime}
              disabled={isEnded}
            />
            <DateTimeField
              label="結束時間"
              required
              error={errors.end}
              dateValue={endDate}
              onDateChange={setEndDate}
              timeValue={endTime}
              onTimeChange={setEndTime}
              disabled={isEnded}
            />
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
              <DateTimeField
                label="報名截止時間"
                error={errors.deadline}
                hint="留空＝可報名至場次開始時刻。"
                dateValue={deadlineDate}
                onDateChange={setDeadlineDate}
                timeValue={deadlineTime}
                onTimeChange={setDeadlineTime}
              />
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
