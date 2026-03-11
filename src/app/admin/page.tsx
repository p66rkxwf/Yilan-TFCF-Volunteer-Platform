import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminPanel,
} from "@/components/shells/admin-page-shell";

const STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  pending: { label: "待審核", dot: "bg-amber-500", text: "text-amber-600" },
  approved: { label: "已通過", dot: "bg-emerald-500", text: "text-emerald-600" },
  rejected: { label: "未通過", dot: "bg-rose-500", text: "text-rose-600" },
  cancelled: { label: "已取消", dot: "bg-slate-400", text: "text-slate-500" },
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: totalRegistrations },
    { count: activeActivities },
    { count: volunteerCount },
    { count: monthlyRegistrations },
    { data: recentRegistrations },
  ] = await Promise.all([
    supabase.from("registrations").select("*", { count: "exact", head: true }),
    supabase
      .from("activities")
      .select("*", { count: "exact", head: true })
      .or("is_cancelled.eq.false,is_cancelled.is.null"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "volunteer"),
    supabase
      .from("registrations")
      .select("*", { count: "exact", head: true })
      .gte(
        "created_at",
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      ),
    supabase
      .from("registrations")
      .select("id, volunteer_id, status, created_at, activities(title), profiles:volunteer_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const metrics = [
    {
      label: "總報名數",
      value: (totalRegistrations ?? 0).toLocaleString(),
      description: "全平台累積報名紀錄",
      icon: "description",
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "進行中活動",
      value: (activeActivities ?? 0).toLocaleString(),
      description: "目前可開放報名或執行中",
      icon: "event_available",
      accent: "bg-sky-100 text-sky-700",
    },
    {
      label: "志工人數",
      value: (volunteerCount ?? 0).toLocaleString(),
      description: "已建立志工身分帳號",
      icon: "groups",
      accent: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "本月新報名",
      value: (monthlyRegistrations ?? 0).toLocaleString(),
      description: "本月新增的報名紀錄",
      icon: "trending_up",
      accent: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Admin Overview"
        title="儀表板"
        description="查看平台報名、活動與志工整體概況。"
        right={
          <>
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
              <span className="material-symbols-outlined text-[18px] text-primary">
                monitoring
              </span>
              即時後台概況
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/activities"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                活動管理
              </Link>
              <Link
                href="/admin/users"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[18px]">group</span>
                使用者管理
              </Link>
            </div>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <AdminMetricCard key={metric.label} {...metric} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
          <AdminPanel
            title="近期報名紀錄"
            description="最新 8 筆志工報名狀態。"
            action={
              <Link
                href="/admin/activities"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-primary transition-colors hover:text-primary/80"
              >
                查看全部
              </Link>
            }
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      志工
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      活動名稱
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      報名日期
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      狀態
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentRegistrations && recentRegistrations.length > 0 ? (
                    recentRegistrations.map((registration: any) => {
                      const status = STATUS_STYLES[registration.status] || STATUS_STYLES.pending;
                      const volunteerName = registration.profiles?.full_name || "未知";
                      const activityTitle = registration.activities?.title || "未知活動";

                      return (
                        <tr key={registration.id} className="transition-colors hover:bg-slate-50/60">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-primary">
                                {volunteerName.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/admin/users/${registration.volunteer_id}`}
                                  className="block truncate text-sm font-semibold text-slate-900 transition-colors hover:text-primary"
                                >
                                  {volunteerName}
                                </Link>
                                <p className="text-xs text-slate-400">志工檔案</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{activityTitle}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(registration.created_at).toLocaleString("zh-TW")}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status.text}`}>
                              <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                        <span className="material-symbols-outlined mb-2 block text-4xl">
                          inbox
                        </span>
                        目前沒有報名紀錄
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AdminPanel>

          <div className="space-y-6">
            <AdminPanel title="管理捷徑" description="快速前往常用管理功能。">
              <div className="space-y-3">
                <Link
                  href="/admin/activities"
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-white"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">活動管理</p>
                    <p className="text-xs text-slate-500">建立活動、審核報名與查看名額。</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
                </Link>
                <Link
                  href="/admin/users"
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-white"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">使用者管理</p>
                    <p className="text-xs text-slate-500">搜尋帳號、調整角色與查看檔案。</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
                </Link>
              </div>
            </AdminPanel>

            <AdminPanel title="狀態說明" description="報名流程的主要狀態定義。">
              <div className="space-y-3">
                {Object.values(STATUS_STYLES).map((status) => (
                  <div
                    key={status.label}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${status.text}`}>
                      <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    <span className="text-xs text-slate-400">報名審核流程</span>
                  </div>
                ))}
              </div>
            </AdminPanel>
          </div>
        </div>
      </div>
    </>
  );
}
