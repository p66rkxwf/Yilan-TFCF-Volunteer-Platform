"use client";

// 自訂服務審核（任何在職職員可審）：待審核收件匣＋已處理；並可代學生登錄。
// 送審通知該生負責社工（見 27）；此頁只負責審核與代登錄流程。

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  TabBar,
  Field,
  RowActionMenu,
  inputClass,
  TimeCell,
  SessionRangeCell,
} from "@/components/admin/ui";
import { DateTimeField } from "@/components/ui/datetime-field";
import { submitCustomService, reviewCustomService } from "@/lib/actions/custom-service";
import { callAction } from "@/lib/ui/toast-actions";
import { dateTimeInputsToIso, formatSessionRange } from "@/lib/admin/datetime";
import { CUSTOM_SERVICE_STATUS } from "@/lib/admin/labels";
import type { CustomServiceRecord } from "@/lib/types/database";

type TabKey = "pending" | "reviewed";

interface Row extends CustomServiceRecord {
  volunteer: { full_name: string } | null;
}

const STATUS_META = CUSTOM_SERVICE_STATUS;

function CustomServiceInner() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabKey) || "pending";

  const [rows, setRows] = useState<Row[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // 審核（檢視＋核可/退回）
  const [target, setTarget] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [rejectConfirm, setRejectConfirm] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState(false);
  const [isActing, setIsActing] = useState(false);

  // 代學生登錄
  const [showSubmit, setShowSubmit] = useState(false);
  const [volunteers, setVolunteers] = useState<{ id: string; full_name: string }[]>([]);
  const [form, setForm] = useState({
    volunteerId: "",
    title: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    leaderName: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const loadCount = useCallback(async () => {
    const { count } = await supabase
      .from("custom_service_records")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingCount(count ?? 0);
  }, [supabase]);

  const load = useCallback(async () => {
    setIsLoading(true);
    let q = supabase
      .from("custom_service_records")
      .select("*, volunteer:volunteer_id(full_name)");
    q =
      tab === "pending"
        ? q.eq("status", "pending").order("created_at", { ascending: true })
        : q.in("status", ["approved", "rejected"]).order("reviewed_at", { ascending: false });
    const { data, error } = await q.limit(500);
    if (error) toast.error(`載入失敗：${error.message}`);
    else setRows((data ?? []) as unknown as Row[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  useEffect(() => {
    load();
  }, [load]);

  const changeTab = (key: TabKey) => {
    router.push(`/admin/custom-service${key === "pending" ? "" : `?tab=${key}`}`);
  };

  const openReview = (row: Row) => {
    setTarget(row);
    setNote("");
  };

  const doReview = async (approve: boolean) => {
    if (!target) return;
    setIsActing(true);
    const result = await callAction(() => reviewCustomService(target.id, approve, note));
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success(approve ? "已核可，時數已計入該學生。" : "已退回。");
    setApproveConfirm(false);
    setRejectConfirm(false);
    setTarget(null);
    await Promise.all([load(), loadCount()]);
  };

  const openSubmit = async () => {
    setForm({
      volunteerId: "",
      title: "",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      leaderName: "",
      description: "",
    });
    setFormErrors({});
    setShowSubmit(true);
    if (volunteers.length === 0) {
      const { data } = await supabase
        .from("volunteer_profiles")
        .select("id, full_name")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("full_name");
      setVolunteers((data ?? []) as { id: string; full_name: string }[]);
    }
  };

  const previewHours = useMemo(() => {
    const s = dateTimeInputsToIso(form.startDate, form.startTime);
    const e = dateTimeInputsToIso(form.endDate, form.endTime);
    if (!s || !e) return null;
    const ms = new Date(e).getTime() - new Date(s).getTime();
    return ms > 0 ? Math.round((ms / 3_600_000) * 10) / 10 : null;
  }, [form.startDate, form.startTime, form.endDate, form.endTime]);

  const submitForVolunteer = async () => {
    const errs: Record<string, string> = {};
    const startIso = dateTimeInputsToIso(form.startDate, form.startTime);
    const endIso = dateTimeInputsToIso(form.endDate, form.endTime);
    if (!form.volunteerId) errs.volunteerId = "請選擇學生";
    if (!form.title.trim()) errs.title = "請填寫活動名稱";
    if (!form.startDate.trim() || !form.startTime.trim()) errs.start = "請填寫開始日期與時間";
    else if (!startIso) errs.start = "開始日期或時間格式不正確";
    if (!form.endDate.trim() || !form.endTime.trim()) errs.end = "請填寫結束日期與時間";
    else if (!endIso) errs.end = "結束日期或時間格式不正確";
    else if (startIso && endIso && endIso <= startIso) errs.end = "結束時間需晚於開始時間";
    if (!form.leaderName.trim()) errs.leaderName = "請填寫活動負責人";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsActing(true);
    const result = await callAction(() => submitCustomService({
      volunteerId: form.volunteerId,
      title: form.title,
      leaderName: form.leaderName,
      description: form.description,
      startIso: startIso!,
      endIso: endIso!,
    }));
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success("已代為登錄並送審。");
    setShowSubmit(false);
    await Promise.all([load(), loadCount()]);
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "pending", label: "待審核", count: pendingCount },
    { key: "reviewed", label: "已處理" },
  ];

  return (
    <>
      <PageHeader
        title="自訂服務審核"
        actions={
          <Button size="sm" onClick={openSubmit}>
            <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[18px]">person_add</span>
            代學生登錄
          </Button>
        }
      />
      <TabBar tabs={tabs} active={tab} onChange={changeTab} />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <Panel padded={false} fill>
          <TableShell>
            <thead>
              <tr>
                <Th>學生</Th>
                <Th>活動名稱</Th>
                <Th>服務時間</Th>
                <Th className="text-right">時數</Th>
                <Th>{tab === "pending" ? "提交時間" : "狀態"}</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={6} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={6} message={tab === "pending" ? "目前沒有待審核的登錄" : "沒有已處理的紀錄"} />
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <Td className="font-semibold text-slate-900">
                      {row.volunteer?.full_name ?? "—"}
                    </Td>
                    <Td>
                      <button
                        onClick={() => openReview(row)}
                        className="text-left font-medium text-slate-800 hover:text-primary"
                      >
                        {row.title}
                      </button>
                      {row.leader_name && (
                        <p className="text-xs text-slate-400">負責人：{row.leader_name}</p>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      <SessionRangeCell start={row.start_at} end={row.end_at} />
                    </Td>
                    <Td className="text-right">{row.service_hours}</Td>
                    <Td className="whitespace-nowrap">
                      {tab === "pending" ? (
                        <span className="block text-slate-500">
                          <TimeCell iso={row.created_at} />
                        </span>
                      ) : (
                        <StatusPill meta={STATUS_META[row.status]} />
                      )}
                    </Td>
                    <Td className="text-right">
                      <RowActionMenu
                        ariaLabel={`${row.title} 的操作`}
                        actions={[
                          { label: "檢視", icon: "visibility", onSelect: () => openReview(row) },
                          tab === "pending" && {
                            label: "核可",
                            icon: "check_circle",
                            onSelect: () => {
                              setTarget(row);
                              setNote("");
                              setApproveConfirm(true);
                            },
                          },
                          tab === "pending" && {
                            label: "退回",
                            icon: "cancel",
                            onSelect: () => {
                              setTarget(row);
                              setNote("");
                              setRejectConfirm(true);
                            },
                          },
                        ]}
                      />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      {/* 檢視／審核明細 */}
      {target && !approveConfirm && !rejectConfirm && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setTarget(null)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-900">{target.title}</h3>
                <StatusPill meta={STATUS_META[target.status]} />
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-500">學生</dt>
                  <dd className="text-slate-800">{target.volunteer?.full_name ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-500">服務時間</dt>
                  <dd className="text-slate-800">{formatSessionRange(target.start_at, target.end_at)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-500">時數</dt>
                  <dd className="text-slate-800">{target.service_hours} 小時</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-500">負責人</dt>
                  <dd className="text-slate-800">{target.leader_name ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-500">說明</dt>
                  <dd className="whitespace-pre-wrap text-slate-800">{target.description ?? "—"}</dd>
                </div>
                {target.status !== "pending" && target.review_note && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">審核說明</dt>
                    <dd className="whitespace-pre-wrap text-slate-800">{target.review_note}</dd>
                  </div>
                )}
              </dl>
            </div>
            {target.status === "pending" && (
              <div className="border-t border-slate-100 px-6 py-4">
                <Field label="審核說明" hint="退回時建議填寫原因，會通知該學生。">
                  <textarea
                    className={`${inputClass} min-h-16`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
                    關閉
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    isLoading={isActing}
                    onClick={() => doReview(false)}
                  >
                    退回
                  </Button>
                  <Button size="sm" isLoading={isActing} onClick={() => doReview(true)}>
                    核可
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={approveConfirm}
        title={target ? `核可「${target.title}」？` : ""}
        description="核可後該學生的服務時數立即計入累計時數並通知本人。審核結果無法直接復原。"
        isLoading={isActing}
        onConfirm={() => doReview(true)}
        onClose={() => {
          setApproveConfirm(false);
          setTarget(null);
        }}
      />

      <ConfirmDialog
        open={rejectConfirm}
        title={target ? `退回「${target.title}」？` : ""}
        description="退回後不計入時數並通知該學生。審核結果無法直接復原（學生可修正後重新登錄）。"
        isConfirmDanger
        confirmText="退回"
        isLoading={isActing}
        onConfirm={() => doReview(false)}
        onClose={() => {
          setRejectConfirm(false);
          setTarget(null);
        }}
      />

      {/* 代學生登錄 */}
      {showSubmit && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setShowSubmit(false)}
            aria-label="關閉"
          />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">代學生登錄自訂服務</h3>
              <p className="mt-1 text-sm text-slate-500">代選定學生登錄一筆已完成的私下服務，仍會建立為待審核。</p>
              <div className="mt-4 space-y-4">
                <Field label="學生" required error={formErrors.volunteerId}>
                  <Select
                    value={form.volunteerId}
                    onValueChange={(v) => setForm((f) => ({ ...f, volunteerId: v }))}
                    placeholder={volunteers.length ? "選擇學生" : "載入中…"}
                    options={volunteers.map((v) => ({ value: v.id, label: v.full_name }))}
                    menuClassName="bg-white"
                  />
                </Field>
                <Field label="活動名稱" required error={formErrors.title}>
                  <input
                    className={inputClass}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    maxLength={120}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DateTimeField
                    label="開始時間"
                    required
                    error={formErrors.start}
                    dateValue={form.startDate}
                    onDateChange={(d) => setForm((f) => ({ ...f, startDate: d }))}
                    timeValue={form.startTime}
                    onTimeChange={(t) => setForm((f) => ({ ...f, startTime: t }))}
                  />
                  <DateTimeField
                    label="結束時間"
                    required
                    error={formErrors.end}
                    dateValue={form.endDate}
                    onDateChange={(d) => setForm((f) => ({ ...f, endDate: d }))}
                    timeValue={form.endTime}
                    onTimeChange={(t) => setForm((f) => ({ ...f, endTime: t }))}
                  />
                </div>
                {previewHours != null && (
                  <p className="text-sm text-slate-500">
                    預計服務時數：<span className="font-bold text-slate-900">{previewHours}</span> 小時
                  </p>
                )}
                <Field label="活動負責人" required error={formErrors.leaderName}>
                  <input
                    className={inputClass}
                    value={form.leaderName}
                    onChange={(e) => setForm((f) => ({ ...f, leaderName: e.target.value }))}
                    maxLength={60}
                  />
                </Field>
                <Field label="說明">
                  <textarea
                    className={`${inputClass} min-h-20`}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button size="sm" variant="ghost" disabled={isActing} onClick={() => setShowSubmit(false)}>
                取消
              </Button>
              <Button size="sm" isLoading={isActing} onClick={submitForVolunteer}>
                送出
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function CustomServicePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">載入中…</div>}>
      <CustomServiceInner />
    </Suspense>
  );
}
