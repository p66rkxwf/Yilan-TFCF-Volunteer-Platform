"use client";

// 學生詳情：基本資料、狀態操作、時數與門檻、報名紀錄、黑名單事件。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { useAdminProfile } from "../../admin-context";
import {
  setVolunteerStatus,
  resetVolunteerPassword,
  setVolunteerWorker,
} from "@/lib/actions/admin-users";
import { updateVolunteerProfile } from "@/lib/actions/admin-volunteers";
import {
  archiveRecord,
  restoreRecord,
  deleteRecordPermanently,
} from "@/lib/actions/admin-archive";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  DescriptionItem,
  Field,
  RowActionMenu,
  inputClass,
} from "@/components/admin/ui";
import { isValidTaiwanPhone, isValidBirthDate } from "@/lib/validation";
import {
  VOLUNTEER_STATUS,
  REGISTRATION_STATUS,
  ATTENDANCE_STATUS,
  CANCEL_REASON,
} from "@/lib/admin/labels";
import { GRADE_LEVEL_LABELS, YILAN_REGIONS } from "@/lib/types/database";
import { formatDate, formatDateTime, formatSessionRange } from "@/lib/admin/datetime";
import type {
  VolunteerProfile,
  RegistrationStatus,
  AttendanceStatus,
  CancelReason,
  BlacklistEvent,
} from "@/lib/types/database";

interface RegRow {
  id: string;
  status: RegistrationStatus;
  attendance: AttendanceStatus | null;
  service_hours: number | null;
  cancel_reason: CancelReason | null;
  session: {
    start_at: string;
    end_at: string;
    activity: { id: string; title: string } | null;
  } | null;
}

interface BlacklistRow extends BlacklistEvent {
  releaser: { full_name: string } | null;
}

type StatusConfirm =
  | { kind: "status"; status: "active" | "suspended" | "graduated"; label: string; danger: boolean };

export default function VolunteerDetailPage() {
  const { volunteerId } = useParams<{ volunteerId: string }>();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const profile = useAdminProfile();
  const isAdmin = profile.role === "system_admin" || profile.role === "unit_admin";
  const isSysAdmin = profile.role === "system_admin";

  const [volunteer, setVolunteer] = useState<
    (VolunteerProfile & { worker: { full_name: string } | null }) | null
  >(null);
  const [hours, setHours] = useState<{ total_hours: number; attended_sessions: number } | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [registrations, setRegistrations] = useState<RegRow[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusConfirm, setStatusConfirm] = useState<StatusConfirm | null>(null);
  const [isActing, setIsActing] = useState(false);

  const [showBlacklistModal, setShowBlacklistModal] = useState(false);
  const [blacklistDays, setBlacklistDays] = useState("");
  const [blacklistNote, setBlacklistNote] = useState("");

  const [showResetPw, setShowResetPw] = useState(false);

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", region: "", birthDate: "" });
  const [editErrors, setEditErrors] = useState<{
    fullName?: string;
    phone?: string;
    birthDate?: string;
  }>({});

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [showReassign, setShowReassign] = useState(false);
  const [reassignTo, setReassignTo] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    const [volRes, hoursRes, regsRes, blRes] = await Promise.all([
      supabase
        .from("volunteer_profiles")
        .select("*, worker:assigned_worker_id(full_name)")
        .eq("id", volunteerId)
        .maybeSingle(),
      supabase.from("v_volunteer_hours").select("*").eq("volunteer_id", volunteerId).maybeSingle(),
      supabase
        .from("registrations")
        .select(
          "id, status, attendance, service_hours, cancel_reason, session:activity_session_id(start_at, end_at, activity:activity_id(id, title))"
        )
        .eq("volunteer_id", volunteerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("blacklist_events")
        .select("*, releaser:released_by(full_name)")
        .eq("volunteer_id", volunteerId)
        .order("triggered_at", { ascending: false }),
    ]);

    if (volRes.error || !volRes.data) {
      toast.error("找不到此學生");
      router.push("/admin/volunteers");
      return;
    }
    const vol = volRes.data as any;
    setVolunteer(vol);
    setHours(hoursRes.data as any);
    setRegistrations((regsRes.data ?? []) as unknown as RegRow[]);
    setBlacklist((blRes.data ?? []) as unknown as BlacklistRow[]);

    const { data: thr } = await supabase
      .from("grade_hour_thresholds")
      .select("min_hours")
      .eq("grade", vol.grade)
      .maybeSingle();
    setThreshold(thr ? (thr as any).min_hours : null);

    // 改派社工的社工清單僅管理員需要（一般職員看不到改派控制項）。
    if (isAdmin) {
      const { data: ws } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("status", "active")
        .eq("job_title", "social_worker")
        .is("deleted_at", null)
        .order("full_name");
      setWorkers((ws ?? []) as { id: string; full_name: string }[]);
    }

    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volunteerId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusConfirm = async () => {
    if (!statusConfirm) return;
    setIsActing(true);
    const result = await setVolunteerStatus(volunteerId, statusConfirm.status);
    setIsActing(false);
    if (result.error && !result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("學生狀態已更新");
    setStatusConfirm(null);
    await load();
  };

  const handleAddBlacklist = async () => {
    setIsActing(true);
    try {
      const days = blacklistDays.trim() ? Number(blacklistDays) : null;
      if (days != null && (!Number.isInteger(days) || days <= 0)) {
        throw new Error("天數需為正整數，或留空使用系統預設");
      }
      const { error } = await supabase.rpc("rpc_manual_blacklist", {
        p_volunteer_id: volunteerId,
        p_days: days,
        p_note: blacklistNote.trim() || null,
      });
      if (error) throw error;
      toast.success("已手動列入黑名單並連動取消未來報名");
      setShowBlacklistModal(false);
      setBlacklistDays("");
      setBlacklistNote("");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setIsActing(false);
    }
  };

  const openReassign = () => {
    setReassignTo(volunteer?.assigned_worker_id ?? "");
    setShowReassign(true);
  };

  const handleReassign = async () => {
    if (!reassignTo) return;
    setIsActing(true);
    const result = await setVolunteerWorker(volunteerId, reassignTo);
    setIsActing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("已更新負責社工");
    setShowReassign(false);
    await load();
  };

  const openEditProfile = () => {
    if (!volunteer) return;
    setEditForm({
      fullName: volunteer.full_name,
      phone: volunteer.phone,
      region: volunteer.region ?? "",
      birthDate: volunteer.birth_date,
    });
    setEditErrors({});
    setShowEditProfile(true);
  };

  const handleEditProfile = async () => {
    const errors: typeof editErrors = {};
    if (!editForm.fullName.trim()) errors.fullName = "請輸入姓名";
    if (!editForm.phone.trim()) errors.phone = "請輸入電話";
    else if (!isValidTaiwanPhone(editForm.phone)) errors.phone = "電話格式不正確（例：0912345678）";
    if (!editForm.birthDate) errors.birthDate = "請選擇生日";
    else if (!isValidBirthDate(editForm.birthDate)) errors.birthDate = "生日不可為未來日期";
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setIsActing(true);
    const result = await updateVolunteerProfile({
      volunteerId,
      fullName: editForm.fullName,
      phone: editForm.phone,
      region: editForm.region,
      birthDate: editForm.birthDate,
    });
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success("已更新學生基本資料");
    setShowEditProfile(false);
    await load();
  };

  const handleResetPassword = async () => {
    setIsActing(true);
    const result = await resetVolunteerPassword(volunteerId);
    setIsActing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `已將密碼重置為帳號「${result.username}」，該學生首次登入時需自行設定新密碼。`
    );
    setShowResetPw(false);
  };

  const statusActions = useMemo(() => {
    if (!volunteer || !isAdmin) return [];
    const actions: StatusConfirm[] = [];
    if (volunteer.status === "active") {
      actions.push({ kind: "status", status: "suspended", label: "停權", danger: true });
      actions.push({ kind: "status", status: "graduated", label: "標記畢業結案", danger: false });
    } else if (volunteer.status === "suspended") {
      actions.push({ kind: "status", status: "active", label: "復職", danger: false });
      actions.push({ kind: "status", status: "graduated", label: "標記畢業結案", danger: false });
    } else if (volunteer.status === "graduated") {
      actions.push({ kind: "status", status: "active", label: "復職", danger: false });
    }
    return actions;
  }, [volunteer, isAdmin]);

  const isArchived = Boolean((volunteer as { deleted_at?: string | null } | null)?.deleted_at);

  const handleArchive = async () => {
    setIsActing(true);
    const result = await archiveRecord("volunteer_profiles", volunteerId);
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    toast.success("已封存並停用該學生帳號登入");
    setShowArchiveConfirm(false);
    await load();
  };

  const handleRestore = async () => {
    const result = await restoreRecord("volunteer_profiles", volunteerId);
    if (result.error) return void toast.error(result.error);
    toast.success("已還原並恢復登入");
    await load();
  };

  const handleDelete = async () => {
    setIsActing(true);
    const result = await deleteRecordPermanently("volunteer_profiles", volunteerId);
    setIsActing(false);
    if (result.error && !result.success) return void toast.error(result.error);
    if (result.error) toast.info(result.error);
    else toast.success("已永久刪除該學生的帳號與相關紀錄");
    router.push("/admin/volunteers");
  };

  if (isLoading || !volunteer) {
    return (
      <>
        <PageHeader title="學生詳情" backHref="/admin/volunteers" backLabel="學生名冊" />
        <div className="p-6 text-sm text-slate-400">資料載入中…</div>
      </>
    );
  }

  const belowThreshold = threshold != null && hours != null && hours.total_hours < threshold;

  return (
    <>
      <PageHeader
        title={volunteer.full_name}
        backHref="/admin/volunteers"
        backLabel="學生名冊"
        actions={
          isAdmin ? (
            <RowActionMenu
              triggerLabel="操作"
              ariaLabel={`${volunteer.full_name} 的操作`}
              actions={[
                ...statusActions.map((a) => ({
                  label: a.label,
                  icon:
                    a.status === "suspended"
                      ? "person_off"
                      : a.status === "graduated"
                        ? "school"
                        : "person_check",
                  onSelect: () => setStatusConfirm(a),
                })),
                !volunteer.is_blacklisted &&
                  volunteer.status === "active" && {
                    label: "加入黑名單",
                    icon: "block",
                    onSelect: () => setShowBlacklistModal(true),
                  },
                {
                  label: "重設密碼",
                  icon: "lock_reset",
                  onSelect: () => setShowResetPw(true),
                },
                isSysAdmin &&
                  (isArchived
                    ? { label: "還原", icon: "restore", onSelect: handleRestore }
                    : {
                        label: "封存",
                        icon: "archive",
                        onSelect: () => setShowArchiveConfirm(true),
                      }),
                isSysAdmin && {
                  label: "永久刪除",
                  icon: "delete_forever",
                  danger: true,
                  onSelect: () => setShowDeleteConfirm(true),
                },
              ]}
            />
          ) : undefined
        }
      />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel
            title="基本資料"
            action={
              <button
                type="button"
                onClick={openEditProfile}
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                編輯
              </button>
            }
          >
            <dl className="space-y-3">
              <DescriptionItem label="狀態">
                <span className="inline-flex items-center gap-2">
                  <StatusPill meta={VOLUNTEER_STATUS[volunteer.status]} />
                  {volunteer.is_blacklisted && (
                    <StatusPill meta={{ label: "黑名單中", badge: "bg-amber-100 text-amber-800" }} />
                  )}
                </span>
              </DescriptionItem>
              <DescriptionItem label="帳號">{volunteer.username}</DescriptionItem>
              <DescriptionItem label="Email">{volunteer.email}</DescriptionItem>
              <DescriptionItem label="電話">{volunteer.phone}</DescriptionItem>
              <DescriptionItem label="地區">{volunteer.region ?? "—"}</DescriptionItem>
              <DescriptionItem label="學制">{GRADE_LEVEL_LABELS[volunteer.grade]}</DescriptionItem>
              <DescriptionItem label="生日">{formatDate(volunteer.birth_date)}</DescriptionItem>
              <DescriptionItem label="負責社工">
                <span className="inline-flex items-center gap-2">
                  {volunteer.worker?.full_name ?? "—"}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={openReassign}
                      className="rounded-lg px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10"
                    >
                      變更
                    </button>
                  )}
                </span>
              </DescriptionItem>
              <DescriptionItem label="上次階段審查">
                {volunteer.last_grade_reviewed_at
                  ? formatDate(volunteer.last_grade_reviewed_at)
                  : "尚未審查"}
              </DescriptionItem>
            </dl>
          </Panel>

          <div className="space-y-5">
            <Panel title="服務時數">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">
                  {hours?.total_hours ?? 0}
                  <span className="ml-1 text-base font-normal text-slate-400">小時</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  已確認出席 {hours?.attended_sessions ?? 0} 場
                </p>
                {threshold != null && (
                  <div
                    className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                      belowThreshold
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    最低門檻 {threshold} 小時 ·{" "}
                    {belowThreshold
                      ? `尚差 ${Math.round((threshold - (hours?.total_hours ?? 0)) * 10) / 10} 小時`
                      : "已達標"}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>

        <Panel title="報名紀錄" description={`共 ${registrations.length} 筆`} padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>活動場次</Th>
                <Th>報名狀態</Th>
                <Th>出席</Th>
                <Th className="text-right">時數</Th>
              </tr>
            </thead>
            <tbody>
              {registrations.length === 0 ? (
                <EmptyRow colSpan={4} message="尚無報名紀錄" />
              ) : (
                registrations.map((reg) => (
                  <tr key={reg.id} className="transition-colors hover:bg-slate-50">
                    <Td>
                      {reg.session?.activity ? (
                        <Link
                          href={`/admin/activities/${reg.session.activity.id}`}
                          className="font-medium text-slate-900 hover:text-primary"
                        >
                          {reg.session.activity.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <p className="text-xs text-slate-400">
                        {reg.session
                          ? formatSessionRange(reg.session.start_at, reg.session.end_at)
                          : ""}
                      </p>
                    </Td>
                    <Td>
                      <StatusPill meta={REGISTRATION_STATUS[reg.status]} />
                      {reg.cancel_reason && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {CANCEL_REASON[reg.cancel_reason]}
                        </p>
                      )}
                    </Td>
                    <Td>
                      {reg.attendance ? (
                        <StatusPill meta={ATTENDANCE_STATUS[reg.attendance]} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="text-right">{reg.service_hours ?? "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>

        <Panel
          title="黑名單事件"
          padded={false}
          action={
            isAdmin && volunteer.is_blacklisted ? (
              <Link
                href="/admin/blacklist"
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                前往黑名單管理 →
              </Link>
            ) : undefined
          }
        >
          <TableShell>
            <thead>
              <tr>
                <Th>列入時間</Th>
                <Th>預計解除</Th>
                <Th>實際解除</Th>
                <Th>類型</Th>
                <Th>備註</Th>
              </tr>
            </thead>
            <tbody>
              {blacklist.length === 0 ? (
                <EmptyRow colSpan={5} message="無黑名單紀錄" />
              ) : (
                blacklist.map((event) => (
                  <tr key={event.id} className="transition-colors hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{formatDateTime(event.triggered_at)}</Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDateTime(event.expected_release_at)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {event.released_at ? (
                        <span className="text-emerald-600">
                          {formatDateTime(event.released_at)}
                          <span className="ml-1 text-xs text-slate-400">
                            （{event.releaser?.full_name ?? "系統自動"}）
                          </span>
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700">生效中</span>
                      )}
                    </Td>
                    <Td>
                      {event.is_manual ? (
                        <span className="text-slate-600">手動</span>
                      ) : (
                        <span className="text-slate-600">自動（缺席）</span>
                      )}
                    </Td>
                    <Td className="text-slate-500">{event.note ?? "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <ConfirmDialog
        open={statusConfirm !== null}
        title={statusConfirm ? `確定要${statusConfirm.label}？` : ""}
        description={
          statusConfirm?.status === "suspended"
            ? "停權後將自動取消該學生名下所有「尚未開始」的有效報名並通知學生，帳號將無法登入與報名。"
            : statusConfirm?.status === "graduated"
            ? "畢業結案將保留資料與登入，僅停止報名，並自動取消尚未開始的有效報名（仍可登入查詢歷年時數）。"
            : "復職後學生可重新登入與報名。"
        }
        isConfirmDanger={statusConfirm?.danger}
        isLoading={isActing}
        onConfirm={handleStatusConfirm}
        onClose={() => setStatusConfirm(null)}
      />

      <ConfirmDialog
        open={showArchiveConfirm}
        title={`封存 ${volunteer.full_name}？`}
        description="封存後該學生將自名冊隱藏並停用登入（可還原）。歷史報名與時數保留；帳號不會被自動刪除。"
        isConfirmDanger
        isLoading={isActing}
        onConfirm={handleArchive}
        onClose={() => setShowArchiveConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title={`永久刪除 ${volunteer.full_name}？`}
        description="將永久刪除該學生的帳號、個人資料、報名與時數紀錄、黑名單事件（無法復原）。若僅需下架帳號請改用「封存」。"
        confirmText="永久刪除"
        isConfirmDanger
        requireText={volunteer.full_name}
        isLoading={isActing}
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />

      {showBlacklistModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setShowBlacklistModal(false)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">手動加入黑名單</h3>
              <p className="mt-1 text-sm text-slate-500">
                將立即列入黑名單並連動取消該學生所有尚未開始的報名，並通知學生。
              </p>
              <div className="mt-4 space-y-4">
                <Field label="黑名單天數" hint="留空＝使用系統預設自動解除天數。">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={blacklistDays}
                    onChange={(e) => setBlacklistDays(e.target.value)}
                    placeholder="系統預設"
                  />
                </Field>
                <Field label="備註" hint="供申訴核對，選填。">
                  <textarea
                    className={`${inputClass} min-h-20`}
                    value={blacklistNote}
                    onChange={(e) => setBlacklistNote(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button
                size="sm"
                variant="ghost"
                disabled={isActing}
                onClick={() => setShowBlacklistModal(false)}
              >
                取消
              </Button>
              <Button size="sm" isLoading={isActing} onClick={handleAddBlacklist}>
                確定加入
              </Button>
            </div>
          </div>
        </div>
      )}

      {showEditProfile && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setShowEditProfile(false)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">編輯基本資料</h3>
              <p className="mt-1 text-sm text-slate-500">
                姓名已鎖定學生自助修改，改由此處維護。學制調整請至「年度審查」。
              </p>
              <div className="mt-4 space-y-4">
                <Field label="姓名" required error={editErrors.fullName}>
                  <input
                    className={inputClass}
                    value={editForm.fullName}
                    onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </Field>
                <Field label="電話" required error={editErrors.phone}>
                  <input
                    className={inputClass}
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </Field>
                <Field label="生日" error={editErrors.birthDate}>
                  <input
                    type="date"
                    className={`${inputClass} date-input`}
                    value={editForm.birthDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, birthDate: e.target.value }))}
                  />
                </Field>
                <Field label="地區">
                  <Select
                    value={editForm.region}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, region: v }))}
                    placeholder="請選擇地區"
                    options={YILAN_REGIONS.map((r) => ({ value: r, label: r }))}
                    menuClassName="bg-white"
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button
                size="sm"
                variant="ghost"
                disabled={isActing}
                onClick={() => setShowEditProfile(false)}
              >
                取消
              </Button>
              <Button size="sm" isLoading={isActing} onClick={handleEditProfile}>
                儲存
              </Button>
            </div>
          </div>
        </div>
      )}

      {showReassign && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setShowReassign(false)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">變更負責社工</h3>
              <p className="mt-1 text-sm text-slate-500">
                為 {volunteer.full_name} 指定新的負責社工。目前：
                {volunteer.worker?.full_name ?? "未指派"}。
              </p>
              <div className="mt-4">
                <Field label="負責社工" hint="僅列出在職社工。">
                  <Select
                    value={reassignTo}
                    onValueChange={setReassignTo}
                    placeholder={workers.length ? "選擇社工" : "無在職社工"}
                    options={workers.map((w) => ({ value: w.id, label: w.full_name }))}
                    menuClassName="bg-white"
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button
                size="sm"
                variant="ghost"
                disabled={isActing}
                onClick={() => setShowReassign(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                isLoading={isActing}
                disabled={!reassignTo || reassignTo === volunteer.assigned_worker_id}
                onClick={handleReassign}
              >
                確定變更
              </Button>
            </div>
          </div>
        </div>
      )}

      {showResetPw && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !isActing && setShowResetPw(false)}
            aria-label="關閉"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">重置密碼</h3>
              <p className="mt-1 text-sm text-slate-500">
                將把 {volunteer.full_name} 的密碼重置為其帳號「
                <span className="font-semibold text-slate-700">{volunteer.username}</span>
                」，該學生首次登入時系統會強制要求設定新密碼。請將此規則轉知學生；
                系統不會另外寄出通知。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <Button
                size="sm"
                variant="ghost"
                disabled={isActing}
                onClick={() => setShowResetPw(false)}
              >
                取消
              </Button>
              <Button size="sm" isLoading={isActing} onClick={handleResetPassword}>
                確定重置
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
