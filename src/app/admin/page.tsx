import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  pending: { label: "待審核", dot: "bg-amber-500", text: "text-amber-500" },
  approved: { label: "已通過", dot: "bg-emerald-500", text: "text-emerald-500" },
  rejected: { label: "未通過", dot: "bg-rose-500", text: "text-rose-500" },
  cancelled: { label: "已取消", dot: "bg-slate-400", text: "text-slate-400" },
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
    supabase
      .from("registrations")
      .select("*", { count: "exact", head: true }),
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
      .select("id, status, created_at, activities(title), profiles:volunteer_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const metrics = [
    {
      label: "總報名數",
      value: totalRegistrations ?? 0,
      icon: "description",
    },
    {
      label: "進行中活動",
      value: activeActivities ?? 0,
      icon: "volunteer_activism",
    },
    {
      label: "志工人數",
      value: volunteerCount ?? 0,
      icon: "group",
    },
    {
      label: "本月新報名",
      value: monthlyRegistrations ?? 0,
      icon: "person_add",
    },
  ];

  return (
    <>
      <header className="bg-white border-b border-slate-200 p-6 flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">儀表板</h2>
            <p className="text-sm text-slate-500">查看平台整體報名與活動概況。</p>
          </div>
          <Link
            href="/admin/activities"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            管理活動
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                  {m.label}
                </span>
                <span className="material-symbols-outlined text-slate-400">
                  {m.icon}
                </span>
              </div>
              <h3 className="text-3xl font-bold">
                {m.value.toLocaleString()}
              </h3>
            </div>
          ))}
        </div>

        {/* Recent Registrations Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold">近期報名紀錄</h3>
            <Link
              href="/admin/activities"
              className="text-xs text-primary font-bold uppercase tracking-widest hover:underline"
            >
              查看全部
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                  <th className="px-6 py-4">志工</th>
                  <th className="px-6 py-4">活動名稱</th>
                  <th className="px-6 py-4">報名日期</th>
                  <th className="px-6 py-4">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRegistrations && recentRegistrations.length > 0 ? (
                  recentRegistrations.map((reg: any) => {
                    const s = STATUS_STYLES[reg.status] || STATUS_STYLES.pending;
                    const volunteerName =
                      (reg.profiles as any)?.full_name || "未知";
                    const activityTitle =
                      (reg.activities as any)?.title || "未知活動";
                    const initials = volunteerName
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <tr key={reg.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-primary">
                              {initials}
                            </div>
                            <span className="font-semibold">{volunteerName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {activityTitle}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {new Date(reg.created_at).toLocaleDateString("zh-TW")}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`flex items-center gap-1.5 font-bold text-xs ${s.text}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${s.dot}`}
                            />
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-slate-400"
                    >
                      目前沒有報名紀錄
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
