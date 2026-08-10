"use client";

// 學生詳情：基本資料、狀態操作、時數與門檻、報名紀錄、黑名單事件。
// 唯讀區塊在 panels.tsx，四個表單對話框在 dialogs.tsx；本檔只留資料載入、
// 操作流程與各區塊的組合。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage, callAction } from "@/lib/ui/toast-actions";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CredentialReveal } from "@/components/admin/credential-reveal";
import { PageHeader, RowActionMenu } from "@/components/admin/ui";
import {
  ProfilePanel,
  HoursPanel,
  RegistrationsPanel,
  BlacklistPanel,
  type VolunteerDetail,
  type RegRow,
  type BlacklistRow,
} from "./panels";
import {
  BlacklistDialog,
  EditProfileDialog,
  ReassignDialog,
  ResetPasswordDialog,
  type EditProfileInput,
} from "./dialogs";

type StatusChange = {
  status: "active" | "suspended" | "graduated";
  label: string;
  danger: boolean;
};

// 同時間只會開一個對話框，故用單一狀態而非各自獨立的布林旗標：兩個對話框
// 同時開啟在結構上就不可能發生。
type OpenDialog =
  | { kind: "status"; change: StatusChange }
  | { kind: "blacklist" }
  | { kind: "editProfile" }
  | { kind: "reassign" }
  | { kind: "resetPassword" }
  | { kind: "archive" }
  | { kind: "delete" }
  | null;

export default function VolunteerDetailPage() {
  const { volunteerId } = useParams<{ volunteerId: string }>();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const profile = useAdminProfile();
  const isAdmin = profile.role === "system_admin" || profile.role === "unit_admin";
  const isSysAdmin = profile.role === "system_admin";

  const [volunteer, setVolunteer] = useState<VolunteerDetail | null>(null);
  const [hours, setHours] = useState<{ total_hours: number; attended_sessions: number } | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [registrations, setRegistrations] = useState<RegRow[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistRow[]>([]);
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [isActing, setIsActing] = useState(false);

  // 重設成功後的一次性臨時密碼；伺服器端不保存明文，關掉就沒了。
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);

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

  // 送出成功的共同收尾：關對話框、跳成功訊息、重新載入。
  const finish = async (message: string) => {
    toast.success(message);
    setDialog(null);
    await load();
  };

  const statusChange = dialog?.kind === "status" ? dialog.change : null;

  const handleStatusConfirm = async () => {
    if (!statusChange) return;
    setIsActing(true);
    const result = await callAction(() => setVolunteerStatus(volunteerId, statusChange.status));
    setIsActing(false);
    if (result.error && !result.success) return void toast.error(result.error);
    await finish("學生狀態已更新");
  };

  const handleAddBlacklist = async ({ days, note }: { days: string; note: string }) => {
    setIsActing(true);
    try {
      const parsedDays = days.trim() ? Number(days) : null;
      if (parsedDays != null && (!Number.isInteger(parsedDays) || parsedDays <= 0)) {
        throw new Error("天數需為正整數，或留空使用系統預設");
      }
      const { error } = await supabase.rpc("rpc_manual_blacklist", {
        p_volunteer_id: volunteerId,
        p_days: parsedDays,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      await finish("已手動列入黑名單並連動取消未來報名");
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setIsActing(false);
    }
  };

  const handleReassign = async (workerId: string) => {
    setIsActing(true);
    const result = await callAction(() => setVolunteerWorker(volunteerId, workerId));
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    await finish("已更新負責社工");
  };

  const handleEditProfile = async (form: EditProfileInput) => {
    if (!volunteer) return;
    setIsActing(true);
    // 聯絡 Email/帳號 僅系統管理員可代改（RPC 亦強制）；一般職員不帶這兩個參數。
    const result = await callAction(() => updateVolunteerProfile({
      volunteerId,
      fullName: form.fullName,
      phone: form.phone,
      region: form.region,
      birthDate: form.birthDate,
      ...(isSysAdmin
        ? { email: form.email.trim(), username: form.username.trim() }
        : {}),
    }));
    setIsActing(false);
    if (result.error) return void toast.error(result.error);

    // 本 handler 不用 finish()：成功訊息之後還要接兩則補充說明，而 finish() 會
    // 先 await 重新載入，會把補充說明推遲一整趟往返、與成功訊息脫節。
    // 變更比對必須在 load() 之前做，才比得到舊值。
    toast.success("已更新學生基本資料");
    if (isSysAdmin && form.email.trim() !== volunteer.email) {
      toast.info("聯絡 Email 已變更並重置驗證狀態，該學生需重新完成 Email 驗證才能報名／簽到。");
    }
    if (isSysAdmin && form.username.trim() !== volunteer.username) {
      toast.info(`該學生下次登入請改用新帳號「${form.username.trim()}」。`);
    }
    setDialog(null);
    await load();
  };

  const handleResetPassword = async () => {
    setIsActing(true);
    const result = await callAction(() => resetVolunteerPassword(volunteerId));
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    // 密碼只回傳這一次，改用需手動關閉的卡片顯示（toast 會自動消失、來不及抄）。
    setRevealed({
      username: result.username ?? volunteer?.username ?? "",
      password: result.password ?? "",
    });
    setDialog(null);
  };

  const handleArchive = async () => {
    setIsActing(true);
    const result = await callAction(() => archiveRecord("volunteer_profiles", volunteerId));
    setIsActing(false);
    if (result.error) return void toast.error(result.error);
    await finish("已封存並停用該學生帳號登入");
  };

  const handleRestore = async () => {
    const result = await callAction(() => restoreRecord("volunteer_profiles", volunteerId));
    if (result.error) return void toast.error(result.error);
    await finish("已還原並恢復登入");
  };

  const handleDelete = async () => {
    setIsActing(true);
    const result = await callAction(() => deleteRecordPermanently("volunteer_profiles", volunteerId));
    setIsActing(false);
    if (result.error && !result.success) return void toast.error(result.error);
    if (result.error) toast.info(result.error);
    else toast.success("已永久刪除該學生的帳號與相關紀錄");
    router.push("/admin/volunteers");
  };

  const statusActions = useMemo(() => {
    if (!volunteer || !isAdmin) return [];
    const actions: StatusChange[] = [];
    if (volunteer.status === "active") {
      actions.push({ status: "suspended", label: "停權", danger: true });
      actions.push({ status: "graduated", label: "標記畢業結案", danger: false });
    } else if (volunteer.status === "suspended") {
      actions.push({ status: "active", label: "復職", danger: false });
      actions.push({ status: "graduated", label: "標記畢業結案", danger: false });
    } else if (volunteer.status === "graduated") {
      actions.push({ status: "active", label: "復職", danger: false });
    }
    return actions;
  }, [volunteer, isAdmin]);

  if (isLoading || !volunteer) {
    return (
      <>
        <PageHeader title="學生詳情" backHref="/admin/volunteers" backLabel="學生名冊" />
        <div className="p-6 text-sm text-slate-400">資料載入中…</div>
      </>
    );
  }

  const isArchived = Boolean((volunteer as { deleted_at?: string | null }).deleted_at);

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
                  onSelect: () => setDialog({ kind: "status", change: a }),
                })),
                !volunteer.is_blacklisted &&
                  volunteer.status === "active" && {
                    label: "加入黑名單",
                    icon: "block",
                    onSelect: () => setDialog({ kind: "blacklist" }),
                  },
                {
                  label: "重設密碼",
                  icon: "lock_reset",
                  onSelect: () => setDialog({ kind: "resetPassword" }),
                },
                isSysAdmin &&
                  (isArchived
                    ? { label: "還原", icon: "restore", onSelect: handleRestore }
                    : {
                        label: "封存",
                        icon: "archive",
                        onSelect: () => setDialog({ kind: "archive" }),
                      }),
                isSysAdmin && {
                  label: "永久刪除",
                  icon: "delete_forever",
                  danger: true,
                  onSelect: () => setDialog({ kind: "delete" }),
                },
              ]}
            />
          ) : undefined
        }
      />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ProfilePanel
            volunteer={volunteer}
            isAdmin={isAdmin}
            onEdit={() => setDialog({ kind: "editProfile" })}
            onReassign={() => setDialog({ kind: "reassign" })}
          />
          <div className="space-y-5">
            <HoursPanel hours={hours} threshold={threshold} />
          </div>
        </div>

        <RegistrationsPanel registrations={registrations} />

        <BlacklistPanel
          blacklist={blacklist}
          showManageLink={isAdmin && volunteer.is_blacklisted}
        />
      </div>

      <ConfirmDialog
        open={statusChange !== null}
        title={statusChange ? `確定要${statusChange.label}？` : ""}
        description={
          statusChange?.status === "suspended"
            ? "停權後將自動取消該學生名下所有「尚未開始」的有效報名並通知學生，帳號將無法登入與報名。"
            : statusChange?.status === "graduated"
            ? "畢業結案將保留資料與登入，僅停止報名，並自動取消尚未開始的有效報名（仍可登入查詢歷年時數）。"
            : "復職後學生可重新登入與報名。"
        }
        isConfirmDanger={statusChange?.danger}
        isLoading={isActing}
        onConfirm={handleStatusConfirm}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog?.kind === "archive"}
        title={`封存 ${volunteer.full_name}？`}
        description="封存後該學生將自名冊隱藏並停用登入（可還原）。歷史報名與時數保留；帳號不會被自動刪除。"
        isConfirmDanger
        isLoading={isActing}
        onConfirm={handleArchive}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={`永久刪除 ${volunteer.full_name}？`}
        description="將永久刪除該學生的帳號、個人資料、報名與時數紀錄、黑名單事件（無法復原）。若僅需下架帳號請改用「封存」。"
        confirmText="永久刪除"
        isConfirmDanger
        requireText={volunteer.full_name}
        isLoading={isActing}
        onConfirm={handleDelete}
        onClose={() => setDialog(null)}
      />

      {/* 關閉時不渲染：欄位預填與清空交由掛載處理，見 dialogs.tsx 檔頭。 */}
      {dialog?.kind === "blacklist" && (
        <BlacklistDialog
          isBusy={isActing}
          onClose={() => setDialog(null)}
          onSubmit={handleAddBlacklist}
        />
      )}

      {dialog?.kind === "editProfile" && (
        <EditProfileDialog
          isBusy={isActing}
          volunteer={volunteer}
          isSysAdmin={isSysAdmin}
          onClose={() => setDialog(null)}
          onSubmit={handleEditProfile}
        />
      )}

      {dialog?.kind === "reassign" && (
        <ReassignDialog
          isBusy={isActing}
          volunteer={volunteer}
          workers={workers}
          onClose={() => setDialog(null)}
          onSubmit={handleReassign}
        />
      )}

      {dialog?.kind === "resetPassword" && (
        <ResetPasswordDialog
          isBusy={isActing}
          volunteer={volunteer}
          onClose={() => setDialog(null)}
          onConfirm={handleResetPassword}
        />
      )}

      <CredentialReveal
        open={revealed !== null}
        title="密碼已重設"
        personName={volunteer.full_name}
        username={revealed?.username ?? ""}
        password={revealed?.password ?? ""}
        onClose={() => setRevealed(null)}
      />
    </>
  );
}
