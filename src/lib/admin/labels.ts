// 後台共用：各 ENUM 的中文標籤與徽章樣式（唯一事實來源，各頁面不得自行定義）

import type {
  ActivityStatus,
  ActivityType,
  AnnouncementStatus,
  AttendanceStatus,
  CancelReason,
  GradeLevel,
  RegistrationStatus,
  StaffJobTitle,
  StaffRole,
  StaffAccountStatus,
  SupportRequestStatus,
  VolunteerStatus,
} from "@/lib/types/database";

export interface StatusMeta {
  label: string;
  // Tailwind class：徽章底色＋文字色
  badge: string;
}

export const ACTIVITY_STATUS: Record<ActivityStatus, StatusMeta> = {
  draft: { label: "草稿", badge: "bg-slate-100 text-slate-600" },
  open: { label: "開放報名", badge: "bg-emerald-100 text-emerald-700" },
  closed: { label: "已截止", badge: "bg-amber-100 text-amber-700" },
  completed: { label: "已結束", badge: "bg-slate-200 text-slate-600" },
  cancelled: { label: "已取消", badge: "bg-rose-100 text-rose-700" },
};

export const ACTIVITY_TYPE: Record<ActivityType, string> = {
  general: "一般活動",
  custom: "自訂活動",
};

export const REGISTRATION_STATUS: Record<RegistrationStatus, StatusMeta> = {
  pending: { label: "待審核", badge: "bg-amber-100 text-amber-700" },
  approved: { label: "已核准", badge: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "已拒絕", badge: "bg-rose-100 text-rose-700" },
  cancel_pending: { label: "取消待審", badge: "bg-orange-100 text-orange-700" },
  cancelled: { label: "已取消", badge: "bg-slate-200 text-slate-600" },
  expired: { label: "已過期", badge: "bg-slate-100 text-slate-500" },
};

export const ATTENDANCE_STATUS: Record<AttendanceStatus, StatusMeta> = {
  attended: { label: "已出席", badge: "bg-emerald-100 text-emerald-700" },
  absent: { label: "缺席", badge: "bg-rose-100 text-rose-700" },
  makeup_attended: { label: "補登出席", badge: "bg-sky-100 text-sky-700" },
};

export const CANCEL_REASON: Record<CancelReason, string> = {
  volunteer_self: "學生自行取消",
  blacklist_cascade: "黑名單連動取消",
  activity_cancelled: "整場活動取消",
  session_cancelled: "單場次取消",
  admin_removed: "管理員操作連動",
};

export const VOLUNTEER_STATUS: Record<VolunteerStatus, StatusMeta> = {
  pending_review: { label: "待審核", badge: "bg-amber-100 text-amber-700" },
  active: { label: "在職", badge: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "停權", badge: "bg-rose-100 text-rose-700" },
  graduated: { label: "已畢業結案", badge: "bg-slate-200 text-slate-600" },
  rejected: { label: "審核未通過", badge: "bg-slate-100 text-slate-500" },
};

export const STAFF_ROLE: Record<StaffRole, string> = {
  system_admin: "系統管理員",
  unit_admin: "單位管理員",
  staff: "一般職員",
};

export const STAFF_JOB_TITLE: Record<StaffJobTitle, string> = {
  social_worker: "社工",
  other: "其他",
};

export const STAFF_STATUS: Record<StaffAccountStatus, StatusMeta> = {
  active: { label: "在職", badge: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "停權", badge: "bg-rose-100 text-rose-700" },
};

export const ANNOUNCEMENT_STATUS: Record<AnnouncementStatus, StatusMeta> = {
  draft: { label: "草稿", badge: "bg-slate-100 text-slate-600" },
  published: { label: "已發布", badge: "bg-emerald-100 text-emerald-700" },
  unpublished: { label: "已下架", badge: "bg-slate-200 text-slate-600" },
};

export const SUPPORT_REQUEST_STATUS: Record<SupportRequestStatus, StatusMeta> = {
  open: { label: "待處理", badge: "bg-amber-100 text-amber-700" },
  resolved: { label: "已處理", badge: "bg-emerald-100 text-emerald-700" },
};

export const GRADE_LEVELS: GradeLevel[] = [
  "junior_high",
  "senior_high",
  "university",
  "graduate_school",
  "doctorate",
];

// 操作紀錄 action → 中文（audit_logs.action）
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  approve_registration: "核准報名",
  reject_registration: "拒絕報名",
  approve_cancel: "核准取消申請",
  reject_cancel: "駁回取消申請",
  manual_checkin: "代登出席",
  mark_absent: "標記缺席",
  makeup_attendance: "補登出席",
  assign_volunteer: "指派學生",
  approve_volunteer_account: "核准學生帳號",
  reject_volunteer_account: "拒絕學生帳號",
  update_volunteer_status: "變更學生狀態",
  manual_blacklist: "手動加入黑名單",
  adjust_blacklist: "調整黑名單",
  cancel_activity: "取消活動",
  cancel_session: "取消場次",
  annual_grade_review: "年度階段審查",
  request_deactivation: "提出停用申請",
  withdraw_deactivation_request: "撤回停用申請",
  approve_deactivation_request: "核准停用申請",
  reject_deactivation_request: "駁回停用申請",
  auto_mark_absent: "自動標記缺席",
  auto_blacklist: "自動列入黑名單",
  auto_release_blacklist: "自動解除黑名單",
  auto_expire_registration: "自動標記報名過期",
  resolve_support_request: "標記支援需求已處理",
  reopen_support_request: "重新開啟支援需求",
};
