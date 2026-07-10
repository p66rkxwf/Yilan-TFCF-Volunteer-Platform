"use client";

// 自訂服務審核（任何在職職員可審）：待審核收件匣＋已處理；並可代志工登錄。
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
} from "@/components/admin/ui";
import { submitCustomService, reviewCustomService } from "@/lib/actions/custom-service";
import { taipeiLocalToIso, formatSessionRange, formatDateTime } from "@/lib/admin/datetime";
import type { CustomServiceRecord, CustomServiceStatus } from "@/lib/types/database";

type TabKey = "pending" | "reviewed";

interface Row extends CustomServiceRecord {
  volunteer: { full_name: string } | null;
}

const STATUS_META: Record<CustomServiceStatus, { label: string; badge: string }> = {
  pending: { label: "待審核", badge: "bg-amber-100 text-amber-800" },
  approved: { label: "已核可", badge: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "已退回", badge: "bg-slate-200 text-slate-600" },
};

function hoursBetween(startLocal: string, endLocal: string): number | null {
  if (!startLocal || !endLocal) return null;
  const ms = new Date(endLocal).getTime() - new Date(startLocal).getTime();
  if (!(ms > 0)) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

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

  // 代志工登錄
  const [showSubmit, setShowSubmit] = useState(false);
  const [volunteers, setVolunteers] = useState<{ id: string; full_name: string }[]>([]);
  const [form, setForm] = useState({
    volunteerId: "",
    title: "",
    startLocal: "",
    endLocal: "",
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
    const result = await reviewCustomService(target.id, approve, note);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success(approve ? "已核可，時數已計入該志工。" : "已退回。");
    setApproveConfirm(false);
    setRejectConfirm(false);
    setTarget(null);
    await Promise.all([load(), loadCount()]);
  };

  const openSubmit = async () => {
    setForm({ volunteerId: "", title: "", startLocal: "", endLocal: "", leaderName: "", description: "" });
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

  const previewHours = useMemo(
    () => hoursBetween(form.startLocal, form.endLocal),
    [form.startLocal, form.endLocal]
  );

  const submitForVolunteer = async () => {
    const errs: Record<string, string> = {};
    if (!form.volunteerId) errs.volunteerId = "請選擇志工";
    if (!form.title.trim()) errs.title = "請填寫活動名稱";
    if (!form.startLocal) errs.startLocal = "請選擇開始時間";
    if (!form.endLocal) errs.endLocal = "請選擇結束時間";
    else if (form.startLocal && form.endLocal <= form.startLocal)
      errs.endLocal = "結束時間需晚於開始時間";
    if (!form.leaderName.trim()) errs.leaderName = "請填寫活動負責人";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsActing(true);
    const result = await submitCustomService({
      volunteerId: form.volunteerId,
      title: form.title,
      leaderName: form.leaderName,
      description: form.description,
      startIso: taipeiLocalToIso(form.startLocal),
      endIso: taipeiLocalToIso(form.endLocal),
    });
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
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            代志工登錄
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
                      {formatSessionRange(row.start_at, row.end_at)}
                    </Td>
                    <Td className="text-right">{row.service_hours}</Td>
                    <Td className="whitespace-nowrap">
                      {tab === "pending" ? (
                        <span className="text-slate-500">{formatDateTime(row.created_at)}</span>
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
                <Field label="審核說明" hint="退回時建議填寫原因，會通知該志工。">
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
        description="核可後該志工的服務時數立即計入累計時數並通知本人。審核結果無法直接復原。"
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
        description="退回後不計入時數並通知該志工。審核結果無法直接復原（志工可修正後重新登錄）。"
        isConfirmDanger
        confirmText="退回"
        isLoading={isActing}
        onConfirm={() => doReview(false)}
        onClose={() => {
          setRejectConfirm(false);
          setTarget(null);
        }}
      />

      {/* 代志工登錄 */}
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
              <h3 className="text-lg font-bold text-slate-900">代志工登錄自訂服務</h3>
              <p className="mt-1 text-sm text-slate-500">代選定志工登錄一筆已完成的私下服務，仍會建立為待審核。</p>
              <div className="mt-4 space-y-4">
                <Field label="志工" required error={formErrors.volunteerId}>
                  <Select
                    value={form.volunteerId}
                    onValueChange={(v) => setForm((f) => ({ ...f, volunteerId: v }))}
                    placeholder={volunteers.length ? "選擇志工" : "載入中…"}
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
                  <Field label="開始時間" required error={formErrors.startLocal}>
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={form.startLocal}
                      onChange={(e) => setForm((f) => ({ ...f, startLocal: e.target.value }))}
                    />
                  </Field>
                  <Field label="結束時間" required error={formErrors.endLocal}>
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={form.endLocal}
                      onChange={(e) => setForm((f) => ({ ...f, endLocal: e.target.value }))}
                    />
                  </Field>
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
