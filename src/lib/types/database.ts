// 手寫型別（非自動產生），對應 files/01_schema.sql ~ files/06_frontend_support.sql（V2）。
// 「最小可行改寫」範圍：僅涵蓋前端本次會用到的表/視圖/RPC，
// 黑名單事件、公告、期間、時數門檻、審查參考年齡、audit_logs、
// notification_outbox 等表本次前端不直接存取，故未列入。

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
    };
    Views: {
      v_organizer_contacts: { Row: OrganizerContact };
      v_session_open_slots: { Row: SessionOpenSlots };
      v_volunteer_hours: { Row: VolunteerHoursSummary };
    };
    Functions: {
      rpc_register_for_session: { Args: { p_session_id: string }; Returns: string };
      rpc_request_cancel: { Args: { p_registration_id: string }; Returns: RegistrationStatus };
      rpc_review_registration: {
        Args: { p_registration_id: string; p_approve: boolean };
        Returns: void;
      };
      rpc_admin_check_in: {
        Args: { p_registration_id: string; p_attendance: "attended" | "absent" };
        Returns: void;
      };
      rpc_makeup_attendance: { Args: { p_registration_id: string }; Returns: void };
      rpc_review_volunteer_account: {
        Args: { p_volunteer_id: string; p_approve: boolean; p_assigned_worker_id?: string | null };
        Returns: void;
      };
      rpc_update_volunteer_status: {
        Args: { p_volunteer_id: string; p_status: "active" | "suspended" | "graduated" };
        Returns: void;
      };
      rpc_cancel_activity: { Args: { p_activity_id: string }; Returns: number };
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
    };
    CompositeTypes: Record<string, never>;
  };
}
