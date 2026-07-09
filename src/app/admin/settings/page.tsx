"use client";

// 期間與系統參數（寫入限系統管理員，RLS 亦強制）：
//  - 系統參數（單列 system_settings）
//  - 期間管理（半年一期、不得重疊）
//  - 最低服務時數門檻（依學制）
//  - 畢業參考年齡（依學制，可留空＝全數列入年審）

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { useAdminProfile } from "../admin-context";
import { purgeNow, type PurgeCounts } from "@/lib/actions/admin-archive";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PageHeader,
  Panel,
  Field,
  inputClass,
  TableShell,
  Th,
  Td,
  EmptyRow,
  RowActionMenu,
} from "@/components/admin/ui";
import { GRADE_LEVELS } from "@/lib/admin/labels";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import { formatDate } from "@/lib/admin/datetime";
import type {
  SystemSettings,
  Period,
  GradeHourThreshold,
  GradeReferenceAge,
  GradeLevel,
} from "@/lib/types/database";

export default function SettingsPage() {
  const supabase = createClient();
  const toast = useToast();
  const profile = useAdminProfile();
  const canEdit = profile.role === "system_admin";

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [thresholds, setThresholds] = useState<Record<GradeLevel, string>>({} as any);
  const [refAges, setRefAges] = useState<Record<GradeLevel, string>>({} as any);

  const [newPeriod, setNewPeriod] = useState({ label: "", start_date: "", end_date: "" });
  const [periodErrors, setPeriodErrors] = useState<{
    label?: string;
    start_date?: string;
    end_date?: string;
  }>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<PurgeCounts | null>(null);
  // 期間刪除與立即清除皆不可復原，先確認
  const [deletePeriodTarget, setDeletePeriodTarget] = useState<Period | null>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  const load = useCallback(async () => {
    const [settingsRes, periodsRes, thrRes, refRes] = await Promise.all([
      supabase.from("system_settings").select("*").maybeSingle(),
      supabase.from("periods").select("*").order("start_date", { ascending: false }),
      supabase.from("grade_hour_thresholds").select("*"),
      supabase.from("grade_reference_ages").select("*"),
    ]);
    setSettings(settingsRes.data as SystemSettings);
    setPeriods((periodsRes.data ?? []) as Period[]);

    const thrMap = {} as Record<GradeLevel, string>;
    const refMap = {} as Record<GradeLevel, string>;
    GRADE_LEVELS.forEach((g) => {
      thrMap[g] = "";
      refMap[g] = "";
    });
    ((thrRes.data ?? []) as GradeHourThreshold[]).forEach((t) => {
      thrMap[t.grade] = String(t.min_hours);
    });
    ((refRes.data ?? []) as GradeReferenceAge[]).forEach((r) => {
      refMap[r.grade] = r.reference_age == null ? "" : String(r.reference_age);
    });
    setThresholds(thrMap);
    setRefAges(refMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingKey("settings");
    try {
      const { error } = await supabase
        .from("system_settings")
        .update({
          blacklist_auto_release_days: settings.blacklist_auto_release_days,
          makeup_attendance_grace_days: settings.makeup_attendance_grace_days,
          review_reminder_days_before: settings.review_reminder_days_before,
          self_checkin_open_minutes_before: settings.self_checkin_open_minutes_before,
          purge_archived_retention_days: settings.purge_archived_retention_days,
          purge_notification_retention_days: settings.purge_notification_retention_days,
          purge_audit_retention_days: settings.purge_audit_retention_days,
          purge_registration_retention_days: settings.purge_registration_retention_days,
        })
        .eq("id", 1);
      if (error) throw error;
      toast.success("系統參數已更新");
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setSavingKey(null);
    }
  };

  const addPeriod = async () => {
    const errors: typeof periodErrors = {};
    if (!newPeriod.label.trim()) errors.label = "請輸入期間名稱";
    if (!newPeriod.start_date) errors.start_date = "請選擇開始日期";
    if (!newPeriod.end_date) errors.end_date = "請選擇結束日期";
    else if (newPeriod.start_date && newPeriod.end_date <= newPeriod.start_date) {
      errors.end_date = "結束日期需晚於開始日期";
    }
    setPeriodErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSavingKey("period");
    try {
      const { error } = await supabase.from("periods").insert({
        label: newPeriod.label.trim(),
        start_date: newPeriod.start_date,
        end_date: newPeriod.end_date,
      });
      if (error) throw error;
      toast.success("期間已新增");
      setNewPeriod({ label: "", start_date: "", end_date: "" });
      await load();
    } catch (error) {
      toast.error(`新增失敗：${getErrorMessage(error as Error)}（期間不得重疊）`);
    } finally {
      setSavingKey(null);
    }
  };

  const confirmDeletePeriod = async () => {
    if (!deletePeriodTarget) return;
    setSavingKey("deletePeriod");
    try {
      const { error } = await supabase.from("periods").delete().eq("id", deletePeriodTarget.id);
      if (error) throw error;
      toast.success("期間已刪除");
      setDeletePeriodTarget(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setSavingKey(null);
    }
  };

  const saveThresholds = async () => {
    setSavingKey("thresholds");
    try {
      const rows = GRADE_LEVELS.map((g) => ({
        grade: g,
        min_hours: Number(thresholds[g] || 0),
      }));
      for (const row of rows) {
        if (!Number.isFinite(row.min_hours) || row.min_hours < 0) {
          throw new Error(`${GRADE_LEVEL_LABELS[row.grade]} 的門檻需為 0 或正數`);
        }
      }
      const { error } = await supabase.from("grade_hour_thresholds").upsert(rows, { onConflict: "grade" });
      if (error) throw error;
      toast.success("最低時數門檻已更新");
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setSavingKey(null);
    }
  };

  const saveRefAges = async () => {
    setSavingKey("refAges");
    try {
      const rows = GRADE_LEVELS.map((g) => {
        const raw = refAges[g]?.trim();
        const value = raw ? Number(raw) : null;
        if (value != null && (!Number.isInteger(value) || value <= 0)) {
          throw new Error(`${GRADE_LEVEL_LABELS[g]} 的參考年齡需為正整數或留空`);
        }
        return { grade: g, reference_age: value };
      });
      const { error } = await supabase.from("grade_reference_ages").upsert(rows, { onConflict: "grade" });
      if (error) throw error;
      toast.success("畢業參考年齡已更新");
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setSavingKey(null);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    const result = await purgeNow();
    setPurging(false);
    if (result.error) return void toast.error(result.error);
    setPurgeResult(result.counts ?? null);
    setShowPurgeConfirm(false);
    const c = result.counts;
    const total = c ? c.archived + c.notifications + c.audit_logs + c.registrations : 0;
    toast.success(`清除完成，共移除 ${total} 筆`);
  };

  const numField = (
    label: string,
    hint: string,
    value: number | undefined,
    onChange: (v: number) => void,
    min = 0
  ) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        disabled={!canEdit}
        className={inputClass}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );

  return (
    <>
      <PageHeader
        title="期間與系統參數"
        description="全機構統一參數與期間設定；寫入限系統管理員。"
      />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        {!canEdit && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            此頁參數僅系統管理員可修改，以下為唯讀檢視。
          </div>
        )}

        {settings && (
          <Panel title="系統參數">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {numField(
                "黑名單自動解除天數",
                "列入後幾天自動解除。",
                settings.blacklist_auto_release_days,
                (v) => setSettings({ ...settings, blacklist_auto_release_days: v }),
                1
              )}
              {numField(
                "補登出席寬限天數",
                "場次結束後幾天內可代登／標缺席，也是缺席掃描起算點。",
                settings.makeup_attendance_grace_days,
                (v) => setSettings({ ...settings, makeup_attendance_grace_days: v })
              )}
              {numField(
                "報名審核提醒天數",
                "場次開始前幾天起，每日提醒主辦人。",
                settings.review_reminder_days_before,
                (v) => setSettings({ ...settings, review_reminder_days_before: v })
              )}
              {numField(
                "自行簽到提前開放分鐘數",
                "學生可於場次開始前幾分鐘開始自行簽到。",
                settings.self_checkin_open_minutes_before,
                (v) => setSettings({ ...settings, self_checkin_open_minutes_before: v })
              )}
            </div>
            {canEdit && (
              <div className="mt-4">
                <Button size="sm" isLoading={savingKey === "settings"} onClick={saveSettings}>
                  儲存系統參數
                </Button>
              </div>
            )}
          </Panel>
        )}

        {settings && (
          <Panel
            title="資料保留與清除"
            description="定期清除逾保留期的資料以控制資料庫大小；每日自動執行，亦可立即手動清除。"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {numField(
                "已封存內容保留天數",
                "封存（軟刪）超過此天數的公告／活動會被永久刪除。",
                settings.purge_archived_retention_days,
                (v) => setSettings({ ...settings, purge_archived_retention_days: v }),
                1
              )}
              {numField(
                "通知保留天數",
                "已寄送／已讀且超過此天數的通知會被清除（未寄出者保留）。",
                settings.purge_notification_retention_days,
                (v) => setSettings({ ...settings, purge_notification_retention_days: v }),
                1
              )}
              {numField(
                "操作紀錄保留天數",
                "超過此天數的稽核日誌會被清除；建議先於報表匯出保存。",
                settings.purge_audit_retention_days,
                (v) => setSettings({ ...settings, purge_audit_retention_days: v }),
                1
              )}
              {numField(
                "終態報名保留天數",
                "已取消／過期／拒絕且無出席的報名，超過此天數會被清除（已出席的時數紀錄不受影響）。",
                settings.purge_registration_retention_days,
                (v) => setSettings({ ...settings, purge_registration_retention_days: v }),
                1
              )}
            </div>
            {canEdit && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="sm" isLoading={savingKey === "settings"} onClick={saveSettings}>
                  儲存保留天數
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  isLoading={purging}
                  onClick={() => setShowPurgeConfirm(true)}
                >
                  立即清除逾期資料
                </Button>
                {purgeResult && (
                  <span className="text-xs text-slate-500">
                    上次清除：封存內容 {purgeResult.archived}、通知 {purgeResult.notifications}、
                    操作紀錄 {purgeResult.audit_logs}、報名 {purgeResult.registrations} 筆
                  </span>
                )}
              </div>
            )}
          </Panel>
        )}

        <Panel title="期間管理" description="半年一期，期間不得重疊。" padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>名稱</Th>
                <Th>開始日期</Th>
                <Th>結束日期</Th>
                {canEdit && <Th className="text-right">操作</Th>}
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <EmptyRow colSpan={canEdit ? 4 : 3} message="尚未設定任何期間" />
              ) : (
                periods.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50">
                    <Td className="font-semibold text-slate-900">{p.label}</Td>
                    <Td className="text-slate-500">{formatDate(p.start_date)}</Td>
                    <Td className="text-slate-500">{formatDate(p.end_date)}</Td>
                    {canEdit && (
                      <Td className="text-right">
                        <RowActionMenu
                          ariaLabel={`${p.label} 的操作`}
                          actions={[
                            {
                              label: "刪除",
                              icon: "delete_forever",
                              danger: true,
                              onSelect: () => setDeletePeriodTarget(p),
                            },
                          ]}
                        />
                      </Td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
          {canEdit && (
            <div className="border-t border-slate-100 p-4 sm:p-5">
              <p className="mb-3 text-sm font-semibold text-slate-700">新增期間</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field label="名稱" required error={periodErrors.label}>
                  <input
                    className={inputClass}
                    placeholder="例：115上"
                    value={newPeriod.label}
                    onChange={(e) => setNewPeriod({ ...newPeriod, label: e.target.value })}
                  />
                </Field>
                <Field label="開始日期" required error={periodErrors.start_date}>
                  <input
                    type="date"
                    className={`${inputClass} date-input`}
                    value={newPeriod.start_date}
                    onChange={(e) => setNewPeriod({ ...newPeriod, start_date: e.target.value })}
                  />
                </Field>
                <Field label="結束日期" required error={periodErrors.end_date}>
                  <input
                    type="date"
                    className={`${inputClass} date-input`}
                    value={newPeriod.end_date}
                    onChange={(e) => setNewPeriod({ ...newPeriod, end_date: e.target.value })}
                  />
                </Field>
                <div className="flex items-end">
                  <Button size="sm" isLoading={savingKey === "period"} onClick={addPeriod}>
                    新增
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="最低服務時數門檻" description="依學制，全域固定；未達標僅提醒／標記。">
            <div className="space-y-3">
              {GRADE_LEVELS.map((g) => (
                <div key={g} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm font-semibold text-slate-700">
                    {GRADE_LEVEL_LABELS[g]}
                  </span>
                  <input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    className={inputClass}
                    value={thresholds[g] ?? ""}
                    onChange={(e) => setThresholds((prev) => ({ ...prev, [g]: e.target.value }))}
                    placeholder="小時"
                  />
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="mt-4">
                <Button size="sm" isLoading={savingKey === "thresholds"} onClick={saveThresholds}>
                  儲存時數門檻
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="畢業參考年齡" description="以 8/31 為基準日；留空＝該階段每年全數列入年審。">
            <div className="space-y-3">
              {GRADE_LEVELS.map((g) => (
                <div key={g} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm font-semibold text-slate-700">
                    {GRADE_LEVEL_LABELS[g]}
                  </span>
                  <input
                    type="number"
                    min={1}
                    disabled={!canEdit}
                    className={inputClass}
                    value={refAges[g] ?? ""}
                    onChange={(e) => setRefAges((prev) => ({ ...prev, [g]: e.target.value }))}
                    placeholder="留空＝全數列入"
                  />
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="mt-4">
                <Button size="sm" isLoading={savingKey === "refAges"} onClick={saveRefAges}>
                  儲存參考年齡
                </Button>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={deletePeriodTarget !== null}
        title={deletePeriodTarget ? `刪除期間「${deletePeriodTarget.label}」？` : ""}
        description="刪除後無法復原；期間達標報表將不再包含此期間。"
        confirmText="刪除"
        isConfirmDanger
        isLoading={savingKey === "deletePeriod"}
        onConfirm={confirmDeletePeriod}
        onClose={() => setDeletePeriodTarget(null)}
      />

      <ConfirmDialog
        open={showPurgeConfirm}
        title="立即清除逾期資料？"
        description="將依上方保留天數立即永久刪除：逾期的已封存內容、已寄送通知、稽核日誌與無出席的終態報名。此操作無法復原，建議先於報表頁匯出備份。"
        confirmText="立即清除"
        isConfirmDanger
        isLoading={purging}
        onConfirm={handlePurge}
        onClose={() => setShowPurgeConfirm(false)}
      />
    </>
  );
}
