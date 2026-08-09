// 各 ENUM 的中文標籤與徽章樣式（唯一事實來源，各頁面不得自行定義）。
// 檔案路徑掛在 admin/ 是沿革，內容同時服務前後台——檔尾另有一段前台專用的
// 標籤，文案與後台刻意不同（見該處說明）。lib/admin/datetime.ts 同樣是全站共用。

import type {
  ActivityStatus,
  AnnouncementStatus,
  AttendanceStatus,
  CancelReason,
  CustomServiceStatus,
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
  cancelled: { label: "已取消", badge: "bg-slate-200 text-slate-600" },
};


export const REGISTRATION_STATUS: Record<RegistrationStatus, StatusMeta> = {
  pending: { label: "待審核", badge: "bg-amber-100 text-amber-700" },
  approved: { label: "已核准", badge: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "已拒絕", badge: "bg-slate-200 text-slate-600" },
  cancel_pending: { label: "取消待審", badge: "bg-orange-100 text-orange-700" },
  cancelled: { label: "已取消", badge: "bg-slate-200 text-slate-600" },
  expired: { label: "已過期", badge: "bg-slate-100 text-slate-500" },
};

export const ATTENDANCE_STATUS: Record<AttendanceStatus, StatusMeta> = {
  attended: { label: "已出席", badge: "bg-emerald-100 text-emerald-700" },
  absent: { label: "缺席", badge: "bg-amber-100 text-amber-800" },
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
  suspended: { label: "停權", badge: "bg-slate-200 text-slate-600" },
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
  suspended: { label: "停權", badge: "bg-slate-200 text-slate-600" },
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

export const CUSTOM_SERVICE_STATUS: Record<CustomServiceStatus, StatusMeta> = {
  pending: { label: "待審核", badge: "bg-amber-100 text-amber-800" },
  approved: { label: "已核可", badge: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "已退回", badge: "bg-slate-200 text-slate-600" },
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
  // 學生自助操作（本表只在後台顯示，故用後台用語，與下方既有條目一致）
  volunteer_register: "學生報名",
  volunteer_cancel: "學生取消/申請取消報名",
  volunteer_self_checkin: "學生自行簽到",
  verify_email: "完成 Email 驗證",
  update_own_volunteer_username: "學生修改登入帳號",
  // 後台維護
  admin_update_volunteer_profile: "編輯學生基本資料",
  admin_update_staff_profile: "編輯職員基本資料",
  update_own_staff_profile: "職員更新個人帳號資料",
  set_volunteer_worker: "改派負責社工",
  reassign_worker: "批量移轉負責社工",
  archive_record: "封存資料",
  restore_record: "還原資料",
  delete_record: "永久刪除資料",
  submit_custom_service: "登錄自訂服務時數",
  approve_custom_service: "核可自訂服務時數",
  reject_custom_service: "退回自訂服務時數",
  manual_purge: "手動清除逾期資料",
  create_announcement: "新增公告",
  update_announcement: "編輯公告",
  delete_announcement: "刪除公告",
  activity_open: "發布活動",
  activity_closed: "截止活動報名",
  create_session: "新增場次",
  update_session: "編輯場次",
  delete_session: "刪除場次",
  update_system_settings: "更新系統參數",
  create_period: "新增期間",
  delete_period: "刪除期間",
};

// 稽核操作者身分別（audit_logs.actor_kind）
// 稽核紀錄的操作者身分。只在後台（操作紀錄頁與報表匯出）顯示，故用後台的
// 「學生」而非前台的「志工」——比照同檔 CANCEL_REASON 的 volunteer_self。
export const AUDIT_ACTOR_KIND_LABELS: Record<string, string> = {
  staff: "職員",
  volunteer: "學生",
  system: "系統自動",
};

// ---------------------------------------------------------------------------
// 前台（志工視角）專用標籤
//
// 文案刻意與上方的後台版本不同：後台是審核者的視角（「已核准」「已拒絕」），
// 前台是被審核者的視角（「已通過」「未通過」），對當事人溫和一些。這是一個
// 決定，不是忘了同步——原本兩份定義散在 /profile/registrations 的清單頁與詳情
// 頁，看起來就像後台那份漏改。並列在此讓差異有跡可循。
//
// 徽章欄位名為 color 而非 badge，同樣沿用前台原本的寫法。
// ---------------------------------------------------------------------------

export interface PublicStatusMeta {
  label: string;
  // Tailwind class：徽章底色＋文字色
  color: string;
}

// dot 是清單頁狀態圓點的底色；詳情頁只用到 label 與 color。
export const REGISTRATION_STATUS_PUBLIC: Record<
  RegistrationStatus,
  PublicStatusMeta & { dot: string }
> = {
  pending: { label: "待審核", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  approved: { label: "已通過", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "未通過", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  cancel_pending: { label: "取消審核中", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  cancelled: { label: "已取消", color: "bg-slate-200 text-slate-600", dot: "bg-slate-400" },
  expired: { label: "已過期", color: "bg-slate-200 text-slate-600", dot: "bg-slate-400" },
};

export const ATTENDANCE_STATUS_PUBLIC: Record<AttendanceStatus, PublicStatusMeta> = {
  attended: { label: "已出席", color: "bg-emerald-100 text-emerald-700" },
  absent: { label: "缺席", color: "bg-amber-100 text-amber-700" },
  makeup_attended: { label: "已出席（補登）", color: "bg-emerald-100 text-emerald-700" },
};
