import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLE_LABELS: Record<string, string> = {
  system_admin: "系統管理員",
  unit_admin: "單位管理員",
  internal_staff: "內部人員",
  volunteer: "志工",
  guest: "訪客",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "啟用", className: "bg-emerald-100 text-emerald-700" },
  blacklisted: { label: "停權", className: "bg-red-100 text-red-700" },
};

const REG_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "待審核", className: "bg-amber-100 text-amber-700" },
  approved: { label: "已通過", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "未通過", className: "bg-rose-100 text-rose-700" },
  cancelled: { label: "已取消", className: "bg-slate-100 text-slate-600" },
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
});

interface AdminUserProfile {
  id: string;
  full_name: string;
  account: string;
  email: string;
  birthday: string | null;
  region: string | null;
  role: string;
  status: string;
  position: string | null;
  assigned_worker_id: string | null;
  created_at: string;
}

interface AdminUserRegistration {
  id: string;
  status: string;
  created_at: string;
  activities: {
    title: string;
    activity_date: string;
    activity_time: string;
    location: string;
  } | null;
}

interface AdminUserFilePageProps {
  params: Promise<{
    userId: string;
  }>;
}

export default async function AdminUserFilePage({
  params,
}: AdminUserFilePageProps) {
  const { userId } = await params;
  const supabase = createAdminClient();

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, account, email, birthday, region, role, status, position, assigned_worker_id, created_at"
    )
    .eq("id", userId)
    .single();
  const profile = profileData as AdminUserProfile | null;

  if (profileError) {
    console.error("admin user file profile query failed", profileError);
  }

  if (!profile) {
    notFound();
  }

  const [{ data: registrationsData }, assignedWorkerResult] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, status, created_at, activities(title, activity_date, activity_time, location)")
      .eq("volunteer_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    profile.assigned_worker_id
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", profile.assigned_worker_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  const registrations = (registrationsData || []) as AdminUserRegistration[];

  const statusStyle = STATUS_STYLES[profile.status] || STATUS_STYLES.active;
  const initials = profile.full_name.slice(0, 2).toUpperCase();
  const registrationCounts = (registrations || []).reduce(
    (acc, registration) => {
      acc[registration.status] = (acc[registration.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <>
      <header className="bg-white border-b border-slate-200 p-6 flex-shrink-0">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Volunteer File
            </p>
            <h2 className="text-2xl font-bold">報名者檔案</h2>
            <p className="text-sm text-slate-500">查看志工基本資料與近期報名紀錄。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/activities"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              返回活動管理
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              返回使用者管理
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-2xl font-black text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{profile.full_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">帳號：{profile.account}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {ROLE_LABELS[profile.role] || profile.role}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle.className}`}>
                    {statusStyle.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">基本資料</h3>
              <span className="text-xs font-medium text-slate-400">
                建立於 {DATE_FORMATTER.format(new Date(profile.created_at))}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InfoField label="姓名" value={profile.full_name} />
              <InfoField label="電子郵件" value={profile.email} />
              <InfoField label="帳號" value={profile.account} />
              <InfoField label="地區" value={profile.region || "未填寫"} />
              <InfoField
                label="生日"
                value={
                  profile.birthday
                    ? DATE_FORMATTER.format(new Date(profile.birthday))
                    : "未填寫"
                }
              />
              <InfoField
                label="指派社工"
                value={assignedWorkerResult.data?.full_name || "未指派"}
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">報名概況</h3>
              <span className="text-sm text-slate-500">
                共 {(registrations || []).length} 筆近期紀錄
              </span>
            </div>

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
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <h3 className="text-lg font-bold">近期報名紀錄</h3>
          </div>

          {(registrations || []).length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400">
              目前沒有報名紀錄
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {(registrations || []).map((registration) => {
                const status = REG_STATUS[registration.status] || REG_STATUS.pending;

                return (
                  <div
                    key={registration.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {registration.activities?.title || "未知活動"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                        <span>
                          活動日期：{registration.activities?.activity_date || "未提供"}
                        </span>
                        <span>
                          活動時間：{registration.activities?.activity_time || "未提供"}
                        </span>
                        <span>
                          地點：{registration.activities?.location || "未提供"}
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
        </section>
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
