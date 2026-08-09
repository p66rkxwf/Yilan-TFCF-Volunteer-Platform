"use client";

// 場次表單（新增／編輯共用）。起訖時間、名額、報名截止皆掛場次層。
// 日期用自製日曆（可打字/點選）、時間免冒號輸入；送出驗證，不用瀏覽器原生日曆。
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
import { DateTimeField } from "@/components/ui/datetime-field";
import { normalizeDateInput, normalizeTimeInput, splitTaipeiLocal, taipeiLocalToIso } from "@/lib/admin/datetime";
import type { ActivitySession, SessionType } from "@/lib/types/database";

export function SessionForm({
  activityId,
  session,
  onSaved,
  onCancel,
}: {
  activityId: string;
  session?: ActivitySession;
  /**
   * 對話框模式：給定時不跳頁，改呼叫此回呼讓外層重載清單。
   * 新增成功後只清掉日期、保留時段／名額／地點，方便連續加多場。
   */
  onSaved?: () => void;
  /** 對話框模式的「取消」；未給則沿用 router.back() */
  onCancel?: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const isEdit = Boolean(session);
  const isEnded = session ? session.end_at <= new Date().toISOString() : false;
  const isDialog = Boolean(onSaved);

  const [sessionType, setSessionType] = useState<SessionType>(session?.session_type ?? "regular");

  const initialStart = splitTaipeiLocal(session?.start_at);
  const initialEnd = splitTaipeiLocal(session?.end_at);
  const initialDeadline = splitTaipeiLocal(session?.registration_deadline_at);
  const [startDate, setStartDate] = useState(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);

  const [capacity, setCapacity] = useState(String(session?.capacity ?? 10));
  const [location, setLocation] = useState(session?.location ?? "");
  const [note, setNote] = useState(session?.note ?? "");
  const [countsHours, setCountsHours] = useState(session?.counts_hours ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{
    start?: string;
    end?: string;
    capacity?: string;
    deadline?: string;
  }>({});

  const isBriefing = sessionType === "briefing";

  // 結束日期跟著開始日期走：多數場次當天結束，重打一次日期是純粹的浪費。
  // 只在結束日期為空、或仍等於變更前的開始日期時才連動，已手動改成隔天者不覆寫。
  const handleStartDateChange = (value: string) => {
    if (!endDate || endDate === startDate) setEndDate(value);
    setStartDate(value);
  };

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

    // 名額與報名截止（正式場次與行前說明會皆需，因說明會亦開放報名）
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) nextErrors.capacity = "名額需為正整數";
    let deadlineIso = startIso ?? "";
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

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    try {
      const loc = location.trim() || null;
      const noteVal = isBriefing ? note.trim() || null : null;
      // 正式場次一律計時數；行前說明會由勾選決定
      const creditsHours = isBriefing ? countsHours : true;

      if (isEdit && session) {
        // 已結束場次：DB 禁改起訖，故僅送可變欄位（名額、截止、地點、說明、計時數）
        const payload: Record<string, unknown> = {
          capacity: cap,
          registration_deadline_at: deadlineIso,
          location: loc,
          note: noteVal,
          counts_hours: creditsHours,
        };
        if (!isEnded) {
          payload.start_at = startIso;
          payload.end_at = endIso;
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
          capacity: cap,
          registration_deadline_at: deadlineIso,
          session_type: sessionType,
          location: loc,
          note: noteVal,
          counts_hours: creditsHours,
        });
        if (error) throw error;
        toast.success(isBriefing ? "行前說明會已新增" : "場次已新增");

        // 對話框模式：留在原地讓使用者接著加下一場。日期清空（一定會不同），
        // 時段／名額／地點保留——連續建立的場次通常只有日期在變。
        if (isDialog) {
          setStartDate("");
          setEndDate("");
          onSaved?.();
          return;
        }
      }
      if (isDialog) {
        onSaved?.();
        return;
      }
      router.push(`/admin/activities/${activityId}`);
      router.refresh();
    } catch (error) {
      toast.error(`儲存失敗：${getErrorMessage(error as Error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const fields = (
    <div className="space-y-4">
      {isEnded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          此場次已結束，為保護時數計算的歷史正確性，起訖時間已鎖定，僅能調整名額、截止、地點與說明。
        </div>
      )}

      {isEdit ? (
        <Field label="場次類型">
          <p className="text-sm font-medium text-slate-700">
            {isBriefing ? "行前說明會" : "正式場次"}
            <span className="ml-2 text-xs text-slate-400">建立後不可變更類型</span>
          </p>
        </Field>
      ) : (
        <Field
          label="場次類型"
          hint="行前說明會同樣開放報名；可另外勾選出席是否計入服務時數。"
        >
          <Select
            value={sessionType}
            onValueChange={(v) => setSessionType(v as SessionType)}
            options={[
              { value: "regular", label: "正式場次" },
              { value: "briefing", label: "行前說明會" },
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
          onDateChange={handleStartDateChange}
          timeValue={startTime}
          onTimeChange={setStartTime}
          disabled={isEnded}
        />
        <DateTimeField
          label="結束時間"
          required
          error={errors.end}
          hint="跨日場次請把結束日期設為隔天。"
          dateValue={endDate}
          onDateChange={setEndDate}
          timeValue={endTime}
          onTimeChange={setEndTime}
          disabled={isEnded}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="名額"
          required
          error={errors.capacity}
          hint="報名達名額即停止收件（待審核也算佔額）。"
        >
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

      <Field label="地點" hint="留空＝沿用活動地點。">
        <input
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="例：羅東鎮運動公園"
          maxLength={120}
        />
      </Field>

      {isBriefing && (
        <Field label="說明" hint="選填。會顯示在前台的場次資訊中。">
          <textarea
            className={`${inputClass} min-h-24`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例：請於開始前 10 分鐘上線，連結 https://…"
          />
        </Field>
      )}

      {isBriefing && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={countsHours}
            onChange={(e) => setCountsHours(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
          />
          <span className="font-medium text-slate-700">此說明會出席計入服務時數</span>
        </label>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={isDialog ? "" : "max-w-2xl"}>
      {/* 對話框模式不套 Panel（外框由 Modal 提供），避免框中框 */}
      {isDialog ? fields : <Panel>{fields}</Panel>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" isLoading={isSaving}>
          {isEdit ? "儲存變更" : isBriefing ? "新增行前說明會" : "新增場次"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel ?? (() => router.back())}
        >
          {isDialog ? "關閉" : "取消"}
        </Button>
        {isDialog && !isEdit && (
          <span className="text-xs text-slate-400">新增後可接著加下一場</span>
        )}
      </div>
    </form>
  );
}
