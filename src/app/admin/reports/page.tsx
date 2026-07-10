"use client";

// 報表與統計：KPI 概況 ＋ 9 種 CSV 匯出（UTF-8 BOM，Excel 直接開）。
// 資料來源多為預先聚合的視圖。「操作紀錄」限系統管理員：RLS（audit_select_sysadmin）
// 亦強制。「職員名冊」的按鈕僅對系統管理員顯示（UI 收斂）；但 staff_profiles 的
// staff_select policy 允許所有在職職員讀取，故此限制屬 UI 層而非 RLS 層。

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { useAdminProfile } from "../admin-context";
import { PageHeader, Panel, Field, inputClass } from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { toCsv, downloadCsv } from "@/utils/csv";
import {
  ACTIVITY_STATUS,
  REGISTRATION_STATUS,
  ATTENDANCE_STATUS,
  VOLUNTEER_STATUS,
  STAFF_ROLE,
  STAFF_JOB_TITLE,
  ANNOUNCEMENT_STATUS,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTOR_KIND_LABELS,
} from "@/lib/admin/labels";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import { formatDateTime } from "@/lib/admin/datetime";
import type { Period } from "@/lib/types/database";

function todayTaipei(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000 + 8 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const supabase = createClient();
  const toast = useToast();
  const profile = useAdminProfile();
  const isSystemAdmin = profile.role === "system_admin";

  const [kpi, setKpi] = useState({ serviceCount: 0, totalHours: 0, absentRate: 0, blacklisted: 0 });
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [dateFrom, setDateFrom] = useState(todayTaipei(-30));
  const [dateTo, setDateTo] = useState(todayTaipei(0));
  const [busy, setBusy] = useState<string | null>(null);

  const loadKpi = useCallback(async () => {
    const [attendanceRes, blacklistRes] = await Promise.all([
      supabase.from("registrations").select("attendance, service_hours").not("attendance", "is", null),
      supabase
        .from("volunteer_profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_blacklisted", true),
    ]);
    const rows = (attendanceRes.data ?? []) as { attendance: string; service_hours: number | null }[];
    const attended = rows.filter((r) => r.attendance === "attended" || r.attendance === "makeup_attended");
    const absent = rows.filter((r) => r.attendance === "absent");
    const totalHours = attended.reduce((sum, r) => sum + Number(r.service_hours ?? 0), 0);
    const absentRate = rows.length > 0 ? Math.round((absent.length / rows.length) * 100) : 0;
    setKpi({
      serviceCount: attended.length,
      totalHours: Math.round(totalHours * 10) / 10,
      absentRate,
      blacklisted: blacklistRes.count ?? 0,
    });
  }, [supabase]);

  useEffect(() => {
    loadKpi();
    supabase
      .from("periods")
      .select("*")
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Period[];
        setPeriods(list);
        if (list.length > 0) setPeriodId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 匯出流程共用包裝：查資料 → 轉 CSV → 下載
  const runExport = async (
    key: string,
    filename: string,
    fetcher: () => Promise<{ headers: string[]; rows: (string | number | null)[][] }>
  ) => {
    setBusy(key);
    try {
      const { headers, rows } = await fetcher();
      if (rows.length === 0) {
        toast.info("查無資料，未產生檔案");
        return;
      }
      downloadCsv(`${filename}_${todayTaipei(0)}`, toCsv(headers, rows));
      toast.success(`已匯出 ${rows.length} 筆`);
    } catch (error) {
      toast.error(`匯出失敗：${getErrorMessage(error as Error)}`);
    } finally {
      setBusy(null);
    }
  };

  const exportVolunteers = () =>
    runExport("volunteers", "學生名冊", async () => {
      const { data, error } = await supabase
        .from("volunteer_profiles")
        .select("full_name, username, email, phone, region, grade, status, is_blacklisted, worker:assigned_worker_id(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return {
        headers: ["姓名", "帳號", "Email", "電話", "地區", "學制", "狀態", "黑名單", "負責社工"],
        rows: (data ?? []).map((v: any) => [
          v.full_name,
          v.username,
          v.email,
          v.phone,
          v.region ?? "",
          GRADE_LEVEL_LABELS[v.grade as keyof typeof GRADE_LEVEL_LABELS] ?? v.grade,
          VOLUNTEER_STATUS[v.status as keyof typeof VOLUNTEER_STATUS]?.label ?? v.status,
          v.is_blacklisted ? "是" : "否",
          v.worker?.full_name ?? "",
        ]),
      };
    });

  const exportHours = () =>
    runExport("hours", "個人服務時數統計", async () => {
      // v_volunteer_hours 只包含有出席紀錄的學生；左接名冊補上 0 時數者。
      const [volsRes, hoursRes] = await Promise.all([
        supabase.from("volunteer_profiles").select("id, full_name, grade").order("full_name"),
        supabase.from("v_volunteer_hours").select("volunteer_id, total_hours, attended_sessions"),
      ]);
      if (volsRes.error) throw volsRes.error;
      if (hoursRes.error) throw hoursRes.error;
      const map = new Map(((hoursRes.data ?? []) as any[]).map((h) => [h.volunteer_id, h]));
      return {
        headers: ["姓名", "學制", "總時數", "出席場次"],
        rows: ((volsRes.data ?? []) as any[]).map((v) => {
          const h = map.get(v.id);
          return [
            v.full_name,
            GRADE_LEVEL_LABELS[v.grade as keyof typeof GRADE_LEVEL_LABELS] ?? v.grade,
            h?.total_hours ?? 0,
            h?.attended_sessions ?? 0,
          ];
        }),
      };
    });

  const exportActivityStats = () =>
    runExport("activityStats", "活動成效統計", async () => {
      const { data, error } = await supabase
        .from("v_activity_stats")
        .select("*")
        .order("start_at", { ascending: false });
      if (error) throw error;
      return {
        headers: [
          "活動", "活動狀態", "場次開始", "場次結束", "名額", "場次取消",
          "報名總數", "有效報名", "已核准", "已拒絕", "出席", "缺席",
        ],
        rows: (data ?? []).map((s: any) => [
          s.title,
          ACTIVITY_STATUS[s.activity_status as keyof typeof ACTIVITY_STATUS]?.label ?? s.activity_status,
          formatDateTime(s.start_at),
          formatDateTime(s.end_at),
          s.capacity,
          s.session_cancelled ? "是" : "否",
          s.total_registrations,
          s.active_registrations,
          s.approved_count,
          s.rejected_count,
          s.attended_count,
          s.absent_count,
        ]),
      };
    });

  const exportAttendanceDetail = () =>
    runExport("attendance", "出席簽到明細", async () => {
      const fromIso = new Date(`${dateFrom}T00:00:00+08:00`).toISOString();
      const toIso = new Date(`${dateTo}T23:59:59+08:00`).toISOString();
      const { data, error } = await supabase
        .from("registrations")
        .select(
          "status, attendance, service_hours, checked_in_at, volunteer:volunteer_id(full_name), session:activity_session_id!inner(start_at, end_at, activity:activity_id(title))"
        )
        .gte("session.start_at", fromIso)
        .lte("session.start_at", toIso)
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return {
        headers: ["學生", "活動", "場次開始", "報名狀態", "出席", "時數", "簽到時間"],
        rows: (data ?? []).map((r: any) => [
          r.volunteer?.full_name ?? "",
          r.session?.activity?.title ?? "",
          r.session ? formatDateTime(r.session.start_at) : "",
          REGISTRATION_STATUS[r.status as keyof typeof REGISTRATION_STATUS]?.label ?? r.status,
          r.attendance
            ? ATTENDANCE_STATUS[r.attendance as keyof typeof ATTENDANCE_STATUS]?.label ?? r.attendance
            : "未登記",
          r.service_hours ?? "",
          r.checked_in_at ? formatDateTime(r.checked_in_at) : "",
        ]),
      };
    });

  const exportBlacklist = () =>
    runExport("blacklist", "黑名單事件紀錄", async () => {
      const { data, error } = await supabase
        .from("blacklist_events")
        .select("*, volunteer:volunteer_id(full_name), releaser:released_by(full_name)")
        .order("triggered_at", { ascending: false });
      if (error) throw error;
      return {
        headers: ["學生", "列入時間", "預計解除", "實際解除", "類型", "解除人", "備註"],
        rows: (data ?? []).map((e: any) => [
          e.volunteer?.full_name ?? "",
          formatDateTime(e.triggered_at),
          formatDateTime(e.expected_release_at),
          e.released_at ? formatDateTime(e.released_at) : "生效中",
          e.is_manual ? "手動" : "自動（缺席）",
          e.released_at ? e.releaser?.full_name ?? "系統自動" : "",
          e.note ?? "",
        ]),
      };
    });

  const exportPeriodHours = () =>
    runExport("periodHours", "期間達標名單", async () => {
      if (!periodId) throw new Error("請先選擇期間");
      const { data, error } = await supabase
        .from("v_volunteer_period_hours")
        .select("*")
        .eq("period_id", periodId)
        .order("full_name");
      if (error) throw error;
      return {
        headers: ["期間", "姓名", "學制", "期間時數", "最低門檻", "是否達標"],
        rows: (data ?? []).map((r: any) => [
          r.period_label,
          r.full_name,
          GRADE_LEVEL_LABELS[r.grade as keyof typeof GRADE_LEVEL_LABELS] ?? r.grade,
          r.period_hours,
          r.min_hours,
          r.meets_threshold ? "達標" : "未達標",
        ]),
      };
    });

  const exportAnnouncements = () =>
    runExport("announcements", "公告清單", async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("title, status, is_pinned, published_at, created_at, creator:created_by(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return {
        headers: ["標題", "狀態", "置頂", "發布時間", "建立時間", "建立者"],
        rows: (data ?? []).map((a: any) => [
          a.title,
          ANNOUNCEMENT_STATUS[a.status as keyof typeof ANNOUNCEMENT_STATUS]?.label ?? a.status,
          a.is_pinned ? "是" : "否",
          a.published_at ? formatDateTime(a.published_at) : "",
          formatDateTime(a.created_at),
          a.creator?.full_name ?? "",
        ]),
      };
    });

  const exportAuditLogs = () =>
    runExport("audit", "操作紀錄", async () => {
      const fromIso = new Date(`${dateFrom}T00:00:00+08:00`).toISOString();
      const toIso = new Date(`${dateTo}T23:59:59+08:00`).toISOString();
      const { data, error } = await supabase
        .from("audit_logs")
        .select("created_at, action, target_table, target_id, actor_id, actor_kind")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // actor_id 可能是職員或志工，兩張表都查後組名。
      const logs = (data ?? []) as any[];
      const ids = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
      const nameMap = new Map<string, string>();
      if (ids.length > 0) {
        const [{ data: staff }, { data: vols }] = await Promise.all([
          supabase.from("staff_profiles").select("id, full_name").in("id", ids),
          supabase.from("volunteer_profiles").select("id, full_name").in("id", ids),
        ]);
        for (const s of (staff ?? []) as any[]) nameMap.set(s.id, s.full_name);
        for (const v of (vols ?? []) as any[]) if (!nameMap.has(v.id)) nameMap.set(v.id, v.full_name);
      }
      return {
        headers: ["時間", "操作", "身分", "操作人", "對象資料表", "對象 ID"],
        rows: logs.map((l) => [
          formatDateTime(l.created_at),
          AUDIT_ACTION_LABELS[l.action] ?? l.action,
          AUDIT_ACTOR_KIND_LABELS[l.actor_kind ?? "system"] ?? "",
          l.actor_id ? nameMap.get(l.actor_id) ?? "" : "系統自動",
          l.target_table,
          l.target_id,
        ]),
      };
    });

  const exportStaff = () =>
    runExport("staff", "職員名冊", async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("full_name, username, email, phone, region, role, job_title, status")
        .order("created_at");
      if (error) throw error;
      return {
        headers: ["姓名", "帳號", "Email", "電話", "地區", "角色", "職稱", "狀態"],
        rows: (data ?? []).map((s: any) => [
          s.full_name,
          s.username,
          s.email,
          s.phone,
          s.region ?? "",
          STAFF_ROLE[s.role as keyof typeof STAFF_ROLE] ?? s.role,
          STAFF_JOB_TITLE[s.job_title as keyof typeof STAFF_JOB_TITLE] ?? s.job_title,
          s.status === "active" ? "在職" : "停權",
        ]),
      };
    });

  const kpiCards = [
    { label: "總服務人次", value: kpi.serviceCount.toLocaleString(), icon: "groups", accent: "text-primary" },
    { label: "總服務時數", value: `${kpi.totalHours.toLocaleString()} 小時`, icon: "schedule", accent: "text-emerald-600" },
    { label: "未出席率", value: `${kpi.absentRate}%`, icon: "trending_down", accent: kpi.absentRate > 20 ? "text-amber-700" : "text-slate-700" },
    { label: "目前黑名單人數", value: kpi.blacklisted.toLocaleString(), icon: "person_off", accent: "text-slate-700" },
  ];

  const reportRow = (
    key: string,
    title: string,
    desc: string,
    onExport: () => void,
    disabled = false
  ) => (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      <button
        type="button"
        disabled={disabled || busy === key}
        onClick={onExport}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[16px]">download</span>
        {busy === key ? "匯出中…" : "匯出 CSV"}
      </button>
    </div>
  );

  return (
    <>
      <PageHeader title="報表與統計" />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpiCards.map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className={`material-symbols-outlined text-[22px] ${c.accent}`}>{c.icon}</span>
              </div>
              <p className={`mt-2 text-2xl font-bold ${c.accent}`}>{c.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{c.label}</p>
            </div>
          ))}
        </div>

        <Panel title="篩選條件">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="起始日期">
              <input
                type="date"
                className={`${inputClass} date-input`}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </Field>
            <Field label="結束日期">
              <input
                type="date"
                className={`${inputClass} date-input`}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </Field>
            <Field label="期間（期間達標名單用）">
              <Select
                value={periodId}
                onValueChange={setPeriodId}
                placeholder={periods.length ? "選擇期間" : "尚未設定期間"}
                options={periods.map((p) => ({ value: p.id, label: p.label }))}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="報表匯出" padded={false}>
          {reportRow("volunteers", "1. 學生名冊", "全體學生基本資料與狀態", exportVolunteers)}
          {reportRow("hours", "2. 個人服務時數統計", "各學生累計時數與出席場次", exportHours)}
          {reportRow("activityStats", "3. 活動成效統計", "報名／通過／拒絕／出席，細至場次", exportActivityStats)}
          {reportRow("attendance", "4. 出席／簽到紀錄明細", "依上方日期區間（以場次開始日計）", exportAttendanceDetail)}
          {reportRow("blacklist", "5. 黑名單事件紀錄", "所有列入與解除事件", exportBlacklist)}
          {reportRow("periodHours", "6. 期間達標／未達標名單", "依上方所選期間比對門檻", exportPeriodHours)}
          {reportRow(
            "audit",
            "7. 操作紀錄",
            isSystemAdmin ? "依上方日期區間" : "僅系統管理員可匯出",
            exportAuditLogs,
            !isSystemAdmin
          )}
          {reportRow("announcements", "8. 公告清單", "所有公告與發布狀態", exportAnnouncements)}
          {reportRow(
            "staff",
            "9. 職員名冊",
            isSystemAdmin ? "全體職員資料" : "僅系統管理員可匯出",
            exportStaff,
            !isSystemAdmin
          )}
        </Panel>
      </div>
    </>
  );
}
