import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminPanel,
} from "@/components/shells/admin-page-shell";
import { VolunteerAccountActions } from "./volunteer-actions-client";
import { DeactivationReviewPanel } from "./deactivation-review-client";
import type { VolunteerStatus } from "@/lib/types/database";

const VOLUNTEER_STATUS_LABELS: Record<string, string> = {
  pending_review: "待審核",
  active: "在職",
  suspended: "停權",
  graduated: "已畢業結案",
  rejected: "審核未通過",
};

const STAFF_ROLE_LABELS: Record<string, string> = {
  system_admin: "系統管理員",
  unit_admin: "單位管理員",
  staff: "一般職員",
};

const STAFF_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "啟用", className: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "停權", className: "bg-red-100 text-red-700" },
};

const REG_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "待審核", className: "bg-amber-100 text-amber-700" },
  approved: { label: "已通過", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "未通過", className: "bg-rose-100 text-rose-700" },
  cancel_pending: { label: "取消審核中", className: "bg-amber-100 text-amber-700" },
  cancelled: { label: "已取消", className: "bg-slate-100 text-slate-600" },
  expired: { label: "已過期", className: "bg-slate-100 text-slate-600" },
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeZone: "Asia/Taipei",
});

interface AdminUserFilePageProps {
  params: Promise<{
    userId: string;
  }>;
}

// V2 拆成 staff_profiles / volunteer_profiles 兩張互斥的表，
// 這個頁面依序查志工再查職員，同一支路由同時服務兩種身分的檔案頁。
export default async function AdminUserFilePage({
  params,
}: AdminUserFilePageProps) {
  const { userId } = await params;
  const supabase = createAdminClient();

  const { data: volunteer } = await supabase
    .from("volunteer_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (volunteer) {
    return <VolunteerFile volunteer={volunteer} supabase={supabase} />;
  }

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!staff) {
    notFound();
  }

  return <StaffFile staff={staff} />;
}

async function VolunteerFile({ volunteer, supabase }: { volunteer: any; supabase: any }) {
  const [
    { data: registrationsData },
    assignedWorkerResult,
    { data: socialWorkers },
    { data: pendingDeactivation },
  ] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, status, created_at, activity_sessions(start_at, end_at, activities(title, location))")
      .eq("volunteer_id", volunteer.id)
      .order("created_at", { ascending: false })
      .limit(10),
    volunteer.assigned_worker_id
      ? supabase
          .from("staff_profiles")
          .select("full_name")
          .eq("id", volunteer.assigned_worker_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("staff_profiles")
      .select("id, full_name")
      .eq("job_title", "social_worker")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("deactivation_requests")
      .select("*")
      .eq("volunteer_id", volunteer.id)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  const registrations = registrationsData || [];
  const statusLabel = VOLUNTEER_STATUS_LABELS[volunteer.status] || volunteer.status;
  const initials = volunteer.full_name.slice(0, 2).toUpperCase();
  const registrationCounts = registrations.reduce(
    (acc: Record<string, number>, registration: any) => {
      acc[registration.status] = (acc[registration.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const workerName = assignedWorkerResult.data?.full_name || "未指派";

  const metricCards = [
    {
      label: "帳號狀態",
      value: statusLabel,
      description: "目前帳號可用狀態",
      icon: "verified_user",
      accent: volunteer.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
    },
    {
      label: "是否列入黑名單",
      value: volunteer.is_blacklisted ? "是" : "否",
      description: "唯讀鏡像，事實來源為黑名單事件表",
      icon: "block",
      accent: volunteer.is_blacklisted ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600",
    },
    {
      label: "近期報名",
      value: registrations.length.toLocaleString(),
      description: "最近 10 筆活動報名紀錄",
      icon: "assignment",
      accent: "bg-sky-100 text-sky-700",
    },
    {
      label: "待審核",
      value: (registrationCounts.pending || 0).toLocaleString(),
      description: "尚未完成審核的報名",
      icon: "pending_actions",
      accent: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Volunteer File"
        title="志工檔案"
        description="查看志工基本資料、審核帳號並管理近期報名紀錄。"
        right={
          <>
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
              <span className="material-symbols-outlined text-[18px] text-primary">person_search</span>
              帳號：{volunteer.username}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/activities"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                返回活動管理
              </Link>
              <Link
                href="/admin/users"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                返回使用者管理
              </Link>
            </div>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <AdminPanel bodyClassName="p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-2xl font-black text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{volunteer.full_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">帳號：{volunteer.username}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {statusLabel}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    指派社工：{workerName}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AdminPanel>

        {pendingDeactivation ? (
          <AdminPanel title="停用申請">
            <DeactivationReviewPanel request={pendingDeactivation} />
          </AdminPanel>
        ) : null}

        <AdminPanel title="帳號審核與狀態管理">
          <VolunteerAccountActions
            volunteerId={volunteer.id}
            status={volunteer.status as VolunteerStatus}
            socialWorkers={socialWorkers ?? []}
          />
        </AdminPanel>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <AdminMetricCard key={card.label} {...card} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <AdminPanel
            title="基本資料"
            description={`建立於 ${DATE_FORMATTER.format(new Date(volunteer.created_at))}`}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InfoField label="姓名" value={volunteer.full_name} />
              <InfoField label="電子郵件" value={volunteer.email} />
              <InfoField label="帳號" value={volunteer.username} />
              <InfoField label="電話" value={volunteer.phone} />
              <InfoField label="地區" value={volunteer.region || "未填寫"} />
              <InfoField
                label="生日"
                value={volunteer.birth_date ? DATE_FORMATTER.format(new Date(volunteer.birth_date)) : "未填寫"}
              />
              <InfoField label="指派社工" value={workerName} />
              <InfoField
                label="最後登入"
                value={
                  volunteer.last_login_at
                    ? DATE_TIME_FORMATTER.format(new Date(volunteer.last_login_at))
                    : "尚無資料"
                }
              />
            </div>
          </AdminPanel>

          <AdminPanel
            title="報名概況"
            description={`共 ${registrations.length} 筆近期紀錄`}
          >
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(REG_STATUS).map(([key, meta]) => (
                <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">{meta.label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {registrationCounts[key] || 0}
                  </p>
                </div>
              ))}
            </div>
          </AdminPanel>
        </div>

        <AdminPanel
          title="近期報名紀錄"
          description="最近 10 筆活動報名狀態與時間。"
          bodyClassName="p-0"
        >
          {registrations.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400">
              <span className="material-symbols-outlined mb-2 block text-4xl">inbox</span>
              目前沒有報名紀錄
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {registrations.map((registration: any) => {
                const status = REG_STATUS[registration.status] || REG_STATUS.pending;
                const session = registration.activity_sessions;

                return (
                  <div
                    key={registration.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {session?.activities?.title || "未知活動"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                        <span>
                          活動時間：{session?.start_at ? DATE_TIME_FORMATTER.format(new Date(session.start_at)) : "未提供"}
                        </span>
                        <span>
                          地點：{session?.activities?.location || "未提供"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 text-sm lg:items-end">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="text-slate-500">
                        報名時間：{DATE_TIME_FORMATTER.format(new Date(registration.created_at))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminPanel>
      </div>
    </>
  );
}

function StaffFile({ staff }: { staff: any }) {
  const statusStyle = STAFF_STATUS_STYLES[staff.status] || STAFF_STATUS_STYLES.active;
  const initials = staff.full_name.slice(0, 2).toUpperCase();

  return (
    <>
      <AdminPageHeader
        eyebrow="Staff File"
        title="職員檔案"
        description="查看職員基本資料。角色／狀態變更請至使用者管理列表操作。"
        right={
          <Link
            href="/admin/users"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            返回使用者管理
          </Link>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <AdminPanel bodyClassName="p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-2xl font-black text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{staff.full_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">帳號：{staff.username}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {STAFF_ROLE_LABELS[staff.role] || staff.role}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle.className}`}>
                    {statusStyle.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel title="基本資料" description={`建立於 ${DATE_FORMATTER.format(new Date(staff.created_at))}`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoField label="姓名" value={staff.full_name} />
            <InfoField label="電子郵件" value={staff.email} />
            <InfoField label="帳號" value={staff.username} />
            <InfoField label="電話" value={staff.phone} />
            <InfoField label="地區" value={staff.region || "未填寫"} />
            <InfoField label="職稱" value={staff.job_title === "social_worker" ? "社工" : "其他"} />
            <InfoField
              label="最後登入"
              value={staff.last_login_at ? DATE_TIME_FORMATTER.format(new Date(staff.last_login_at)) : "尚無資料"}
            />
          </div>
        </AdminPanel>
      </div>
    </>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
