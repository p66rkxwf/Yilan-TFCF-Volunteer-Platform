// 手寫型別（非自動產生），對應 supabase/v2/01_schema.sql ~ 07_deactivation_requests.sql。
// V2 後台全面重寫後涵蓋除 notification_outbox（僅發信 worker 可存取）
// 以外的全部表／視圖／RPC。

export type StaffRole = "system_admin" | "unit_admin" | "staff";
export type StaffAccountStatus = "active" | "suspended";
export type StaffJobTitle = "social_worker" | "other";

export type VolunteerStatus =
  | "pending_review"
  | "active"
  | "suspended"
  | "graduated"
  | "rejected";

export type GradeLevel =
  | "junior_high"
  | "senior_high"
  | "university"
  | "graduate_school"
  | "doctorate";

export type ActivityType = "general" | "custom";
export type ActivityStatus = "draft" | "open" | "closed" | "completed" | "cancelled";

export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancel_pending"
  | "cancelled"
  | "expired";

export type AttendanceStatus = "attended" | "absent" | "makeup_attended";

export type CancelReason =
  | "volunteer_self"
  | "blacklist_cascade"
  | "activity_cancelled"
  | "session_cancelled"
  | "admin_removed";

export type DeactivationRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type SupportRequestStatus = "open" | "resolved";

// 前台選單常數；V2 的 volunteer_profiles.region / staff_profiles.region 是自由 text
// （非資料庫 ENUM），此清單僅供 UI 下拉選單使用。
export const YILAN_REGIONS = [
  "宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉", "壯圍鄉",
  "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉",
] as const;
export type YilanRegion = (typeof YILAN_REGIONS)[number];

export const GRADE_LEVEL_LABELS: Record<GradeLevel, string> = {
  junior_high: "國中",
  senior_high: "高中",
  university: "大學",
  graduate_school: "研究所",
  doctorate: "博士",
};

export interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  username: string;
  phone: string;
  region: string | null;
  role: StaffRole;
  job_title: StaffJobTitle;
  status: StaffAccountStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface VolunteerProfile {
  id: string;
  full_name: string;
  birth_date: string;
  email: string;
  username: string;
  phone: string;
  region: string | null;
  grade: GradeLevel;
  status: VolunteerStatus;
  is_blacklisted: boolean;
  assigned_worker_id: string | null;
  last_grade_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface Activity {
  id: string;
  created_by: string;
  title: string;
  content: string | null;
  activity_type: ActivityType;
  location: string;
  cancel_review_window_days: number;
  status: ActivityStatus;
  created_at: string;
  updated_at: string;
}

export interface ActivitySession {
  id: string;
  activity_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  registration_deadline_at: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityOrganizer {
  activity_id: string;
  staff_id: string;
  created_at: string;
}

export interface Registration {
  id: string;
  activity_session_id: string;
  volunteer_id: string;
  status: RegistrationStatus;
  attendance: AttendanceStatus | null;
  checked_in_at: string | null;
  attendance_recorded_by: string | null;
  service_hours: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancel_requested_at: string | null;
  cancel_reviewed_by: string | null;
  cancel_reviewed_at: string | null;
  cancel_reason: CancelReason | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Favorite {
  id: string;
  volunteer_id: string;
  activity_id: string;
  created_at: string;
}

export interface DeactivationRequest {
  id: string;
  volunteer_id: string;
  reason: string | null;
  status: DeactivationRequestStatus;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportRequest {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: SupportRequestStatus;
  created_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AnnouncementStatus = "draft" | "published" | "unpublished";

export interface BlacklistEvent {
  id: string;
  volunteer_id: string;
  registration_id: string | null;
  triggered_at: string;
  expected_release_at: string;
  released_at: string | null;
  released_by: string | null;
  is_manual: boolean;
  note: string | null;
  updated_at: string;
}

export interface Announcement {
  id: string;
  created_by: string;
  title: string;
  content: string;
  is_pinned: boolean;
  status: AnnouncementStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface GradeHourThreshold {
  grade: GradeLevel;
  min_hours: number;
  updated_at: string;
}

export interface GradeReferenceAge {
  grade: GradeLevel;
  reference_age: number | null;
  updated_at: string;
}

export interface SystemSettings {
  id: number;
  blacklist_auto_release_days: number;
  makeup_attendance_grace_days: number;
  review_reminder_days_before: number;
  self_checkin_open_minutes_before: number;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string;
  target_id: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// v_volunteer_period_hours：期間時數與達標比對（報表 6）
export interface VolunteerPeriodHours {
  period_id: string;
  period_label: string;
  volunteer_id: string;
  full_name: string;
  grade: GradeLevel;
  period_hours: number;
  min_hours: number;
  meets_threshold: boolean;
}

// v_activity_stats：活動/場次成效統計（報表 3）
export interface ActivityStats {
  activity_id: string;
  title: string;
  activity_status: ActivityStatus;
  activity_session_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  session_cancelled: boolean;
  total_registrations: number;
  active_registrations: number;
  approved_count: number;
  rejected_count: number;
  attended_count: number;
  absent_count: number;
}

// v_annual_grade_review_list：年度審查建議清單（基準日 = 當年 8/31）
export interface AnnualGradeReviewRow {
  id: string;
  full_name: string;
  grade: GradeLevel;
  birth_date: string;
  last_grade_reviewed_at: string | null;
  age_at_aug31: number;
  reference_age: number | null;
}

// v_overdue_cancel_reviews：#20b 逾期未審的取消申請（人工待辦）
export interface OverdueCancelReview {
  registration_id: string;
  volunteer_id: string;
  activity_session_id: string;
  cancel_requested_at: string | null;
  start_at: string;
  end_at: string;
  activity_id: string;
}

// v_organizer_contacts：志工唯一能讀到的職員個資（姓名＋電話）
export interface OrganizerContact {
  activity_id: string;
  full_name: string;
  phone: string;
}

// v_session_open_slots（06_frontend_support.sql）：志工前台剩餘名額
export interface SessionOpenSlots {
  activity_session_id: string;
  activity_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  registration_deadline_at: string;
  session_cancelled: boolean;
  open_slots: number;
}

// v_volunteer_hours：個人服務時數總覽
export interface VolunteerHoursSummary {
  volunteer_id: string;
  total_hours: number;
  attended_sessions: number;
}

export interface Database {
  public: {
    Tables: {
      staff_profiles: {
        Row: StaffProfile;
        Insert: Omit<StaffProfile, "created_at" | "updated_at" | "last_login_at">;
        Update: Partial<Omit<StaffProfile, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      volunteer_profiles: {
        Row: VolunteerProfile;
        Insert: Omit<
          VolunteerProfile,
          "created_at" | "updated_at" | "last_login_at" | "is_blacklisted" | "assigned_worker_id" | "last_grade_reviewed_at" | "status"
        > & {
          status?: VolunteerStatus;
          is_blacklisted?: boolean;
          assigned_worker_id?: string | null;
          last_grade_reviewed_at?: string | null;
        };
        Update: Partial<Omit<VolunteerProfile, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      activities: {
        Row: Activity;
        Insert: Omit<Activity, "id" | "created_at" | "updated_at" | "status"> & {
          status?: ActivityStatus;
        };
        Update: Partial<Omit<Activity, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      activity_sessions: {
        Row: ActivitySession;
        Insert: Omit<ActivitySession, "id" | "created_at" | "updated_at" | "cancelled_at"> & {
          cancelled_at?: string | null;
        };
        Update: Partial<Omit<ActivitySession, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      activity_organizers: {
        Row: ActivityOrganizer;
        Insert: Omit<ActivityOrganizer, "created_at">;
        Update: Partial<Omit<ActivityOrganizer, "activity_id" | "staff_id" | "created_at">>;
        Relationships: [];
      };
      registrations: {
        Row: Registration;
        Insert: Pick<Registration, "activity_session_id" | "volunteer_id"> &
          Partial<Omit<Registration, "id" | "activity_session_id" | "volunteer_id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Registration, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      favorites: {
        Row: Favorite;
        Insert: Omit<Favorite, "id" | "created_at">;
        Update: Partial<Omit<Favorite, "id" | "created_at">>;
        Relationships: [];
      };
      deactivation_requests: {
        Row: DeactivationRequest;
        Insert: Pick<DeactivationRequest, "volunteer_id"> &
          Partial<Omit<DeactivationRequest, "id" | "volunteer_id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<DeactivationRequest, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      blacklist_events: {
        Row: BlacklistEvent;
        Insert: never; // 寫入一律走 RPC
        Update: never;
        Relationships: [];
      };
      announcements: {
        Row: Announcement;
        Insert: Omit<Announcement, "id" | "created_at" | "updated_at" | "published_at"> & {
          published_at?: string | null;
        };
        Update: Partial<Omit<Announcement, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      periods: {
        Row: Period;
        Insert: Omit<Period, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Period, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      grade_hour_thresholds: {
        Row: GradeHourThreshold;
        Insert: Omit<GradeHourThreshold, "updated_at">;
        Update: Partial<Omit<GradeHourThreshold, "grade" | "updated_at">>;
        Relationships: [];
      };
      grade_reference_ages: {
        Row: GradeReferenceAge;
        Insert: Omit<GradeReferenceAge, "updated_at">;
        Update: Partial<Omit<GradeReferenceAge, "grade" | "updated_at">>;
        Relationships: [];
      };
      system_settings: {
        Row: SystemSettings;
        Insert: never; // 單列已種子
        Update: Partial<Omit<SystemSettings, "id" | "updated_at">>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: never; // 僅 SECURITY DEFINER 函式寫入
        Update: never;
        Relationships: [];
      };
      support_requests: {
        Row: SupportRequest;
        Insert: never; // 寫入一律走 rpc_submit_support_request
        Update: never; // 狀態變更一律走 rpc_resolve_support_request
        Relationships: [];
      };
    };
    Views: {
      v_organizer_contacts: { Row: OrganizerContact };
      v_session_open_slots: { Row: SessionOpenSlots };
      v_volunteer_hours: { Row: VolunteerHoursSummary };
      v_volunteer_period_hours: { Row: VolunteerPeriodHours };
      v_activity_stats: { Row: ActivityStats };
      v_annual_grade_review_list: { Row: AnnualGradeReviewRow };
      v_overdue_cancel_reviews: { Row: OverdueCancelReview };
    };
    Functions: {
      rpc_register_for_session: { Args: { p_session_id: string }; Returns: string };
      rpc_request_cancel: { Args: { p_registration_id: string }; Returns: RegistrationStatus };
      rpc_review_registration: {
        Args: { p_registration_id: string; p_approve: boolean };
        Returns: void;
      };
      rpc_review_cancel: {
        Args: { p_registration_id: string; p_approve: boolean };
        Returns: void;
      };
      rpc_self_check_in: { Args: { p_registration_id: string }; Returns: void };
      rpc_admin_check_in: {
        Args: { p_registration_id: string; p_attendance: "attended" | "absent" };
        Returns: void;
      };
      rpc_makeup_attendance: { Args: { p_registration_id: string }; Returns: void };
      rpc_assign_volunteer: {
        Args: { p_session_id: string; p_volunteer_id: string };
        Returns: string;
      };
      rpc_review_volunteer_account: {
        Args: { p_volunteer_id: string; p_approve: boolean; p_assigned_worker_id?: string | null };
        Returns: void;
      };
      rpc_update_volunteer_status: {
        Args: { p_volunteer_id: string; p_status: "active" | "suspended" | "graduated" };
        Returns: void;
      };
      rpc_manual_blacklist: {
        Args: { p_volunteer_id: string; p_days?: number | null; p_note?: string | null };
        Returns: string;
      };
      rpc_adjust_blacklist: {
        Args: { p_event_id: string; p_new_release_at: string };
        Returns: void;
      };
      rpc_cancel_activity: { Args: { p_activity_id: string }; Returns: number };
      rpc_cancel_session: { Args: { p_session_id: string }; Returns: number };
      rpc_update_volunteer_grade: {
        Args: { p_volunteer_id: string; p_new_grade?: GradeLevel | null };
        Returns: void;
      };
      rpc_request_deactivation: { Args: { p_reason?: string | null }; Returns: string };
      rpc_withdraw_deactivation_request: { Args: Record<string, never>; Returns: void };
      rpc_review_deactivation_request: {
        Args: { p_request_id: string; p_approve: boolean; p_note?: string | null };
        Returns: void;
      };
      rpc_submit_support_request: {
        Args: { p_name: string; p_email: string; p_topic: string; p_message: string };
        Returns: string;
      };
      rpc_resolve_support_request: {
        Args: { p_request_id: string; p_resolved: boolean };
        Returns: void;
      };
    };
    Enums: {
      staff_role: StaffRole;
      staff_account_status: StaffAccountStatus;
      staff_job_title: StaffJobTitle;
      volunteer_status: VolunteerStatus;
      grade_level: GradeLevel;
      activity_type: ActivityType;
      activity_status: ActivityStatus;
      registration_status: RegistrationStatus;
      attendance_status: AttendanceStatus;
      cancel_reason: CancelReason;
      announcement_status: AnnouncementStatus;
      deactivation_request_status: DeactivationRequestStatus;
      support_request_status: SupportRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
