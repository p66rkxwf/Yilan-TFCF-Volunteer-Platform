"use client";

// 活動基本資料表單（新增／編輯共用）。
// 主辦人為多選（在職職員）；日期、名額、截止皆屬「場次」層，不在此表單。

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Panel, SearchInput } from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { STAFF_JOB_TITLE } from "@/lib/admin/labels";
import type { Activity, ActivityType, StaffJobTitle } from "@/lib/types/database";

interface StaffOption {
  id: string;
  full_name: string;
  job_title: StaffJobTitle;
}

export interface ActivityFormValue {
  title: string;
  content: string;
  activity_type: ActivityType;
  location: string;
  cancel_review_window_days: number;
  organizerIds: string[];
}

export function ActivityForm({
  activity,
  initialOrganizerIds,
  currentUserId,
}: {
  activity?: Activity;
  initialOrganizerIds?: string[];
  currentUserId: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const isEdit = Boolean(activity);

  const [title, setTitle] = useState(activity?.title ?? "");
  const [content, setContent] = useState(activity?.content ?? "");
  const [activityType, setActivityType] = useState<ActivityType>(
    activity?.activity_type ?? "general"
  );
  const [location, setLocation] = useState(activity?.location ?? "");
  const [cancelWindow, setCancelWindow] = useState(
    String(activity?.cancel_review_window_days ?? 0)
  );
  const [organizerIds, setOrganizerIds] = useState<Set<string>>(
    new Set(initialOrganizerIds ?? [currentUserId])
  );
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, full_name, job_title")
        .eq("status", "active")
        .order("full_name");
      if (!cancelled) {
        if (error) toast.error(`載入職員清單失敗：${error.message}`);
        else setStaffOptions((data ?? []) as StaffOption[]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim();
    if (!q) return staffOptions;
    return staffOptions.filter((s) => s.full_name.includes(q));
  }, [staffOptions, staffSearch]);

  const toggleOrganizer = (id: string) => {
    setOrganizerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return void toast.error("請輸入活動標題");
    if (!location.trim()) return void toast.error("請輸入活動地點");
    const windowDays = Number(cancelWindow);
    if (!Number.isInteger(windowDays) || windowDays < 0) {
      return void toast.error("取消審核天數需為 0 或正整數");
    }
    if (organizerIds.size === 0) {
      return void toast.error("請至少指定一位主辦人（負責審核與接收提醒）");
    }

    setIsSaving(true);
    try {
      let activityId = activity?.id;

      if (isEdit && activityId) {
        const { error } = await supabase
          .from("activities")
          .update({
            title: title.trim(),
            content: content.trim() || null,
            activity_type: activityType,
            location: location.trim(),
            cancel_review_window_days: windowDays,
          })
          .eq("id", activityId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("activities")
          .insert({
            title: title.trim(),
            content: content.trim() || null,
            activity_type: activityType,
            location: location.trim(),
            cancel_review_window_days: windowDays,
            created_by: currentUserId,
          })
          .select("id")
          .single();
        if (error) throw error;
        activityId = data.id as string;
      }

      // 主辦人差異同步（先刪後補；集合小，逐筆即可）
      const desired = organizerIds;
      const current = new Set(initialOrganizerIds ?? []);
      const toAdd = [...desired].filter((id) => !current.has(id));
      const toRemove = isEdit ? [...current].filter((id) => !desired.has(id)) : [];

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("activity_organizers")
          .insert(toAdd.map((staffId) => ({ activity_id: activityId, staff_id: staffId })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("activity_organizers")
          .delete()
          .eq("activity_id", activityId)
          .in("staff_id", toRemove);
        if (error) throw error;
      }

      toast.success(isEdit ? "活動已更新" : "活動已建立（草稿），請接著新增場次");
      router.push(`/admin/activities/${activityId}`);
      router.refresh();
    } catch (error) {
      toast.error(`儲存失敗：${getErrorMessage(error as Error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
      <Panel title="基本資料">
        <div className="space-y-4">
          <Field label="活動標題" required>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：兒童課後陪伴——暑期梯次"
              maxLength={120}
            />
          </Field>

          <Field label="活動說明" hint="支援換行；學生在前台會看到此內容。">
            <textarea
              className={`${inputClass} min-h-32`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="活動內容、注意事項、集合方式…"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="活動類型">
              <Select
                value={activityType}
                onValueChange={(v) => setActivityType(v as ActivityType)}
                options={[
                  { value: "general", label: "一般活動" },
                  { value: "custom", label: "自訂活動（可覆寫時數）" },
                ]}
              />
            </Field>

            <Field label="活動地點" required>
              <input
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="例：宜蘭家扶中心 2 樓"
                maxLength={120}
              />
            </Field>
          </div>

          <Field
            label="取消審核天數門檻"
            required
            hint="場次開始前 N 天內學生取消需審核；0 = 任何時候取消都需審核。"
          >
            <input
              type="number"
              min={0}
              className={inputClass}
              value={cancelWindow}
              onChange={(e) => setCancelWindow(e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="主辦人"
        description="主辦人負責審核報名並接收審核提醒；可多位。姓名與電話會公開給學生。"
      >
        <div className="space-y-3">
          <SearchInput
            value={staffSearch}
            onChange={setStaffSearch}
            placeholder="搜尋職員姓名…"
            className="max-w-xs"
          />
          <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {filteredStaff.map((staff) => (
              <label
                key={staff.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={organizerIds.has(staff.id)}
                  onChange={() => toggleOrganizer(staff.id)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                />
                <span className="font-medium text-slate-800">{staff.full_name}</span>
                <span className="text-xs text-slate-400">{STAFF_JOB_TITLE[staff.job_title]}</span>
              </label>
            ))}
            {filteredStaff.length === 0 && (
              <p className="col-span-full py-3 text-center text-sm text-slate-400">
                找不到符合的職員
              </p>
            )}
          </div>
          <p className="text-xs text-slate-500">已選 {organizerIds.size} 位主辦人</p>
        </div>
      </Panel>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" isLoading={isSaving}>
          {isEdit ? "儲存變更" : "建立活動（草稿）"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </form>
  );
}
