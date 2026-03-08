export type AccountStatus = "active" | "blacklisted";

export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type StaffPosition = "social_worker" | "general_staff";

export type UserRole =
  | "system_admin"
  | "unit_admin"
  | "internal_staff"
  | "volunteer"
  | "guest";

export type YilanRegion =
  | "宜蘭市"
  | "羅東鎮"
  | "蘇澳鎮"
  | "頭城鎮"
  | "礁溪鄉"
  | "壯圍鄉"
  | "員山鄉"
  | "冬山鄉"
  | "五結鄉"
  | "三星鄉"
  | "大同鄉"
  | "南澳鄉";

export interface Profile {
  id: string;
  full_name: string;
  birthday: string | null;
  email: string;
  region: YilanRegion | null;
  assigned_worker_id: string | null;
  role: UserRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
  position: StaffPosition | null;
  account: string;
}

export interface Activity {
  id: string;
  publisher_id: string;
  title: string;
  content: string;
  activity_date: string;
  activity_time: string;
  location: string;
  capacity: number;
  manager_name: string;
  cancel_deadline: string;
  is_cancelled: boolean;
  created_at: string;
}

export interface Registration {
  id: string;
  activity_id: string;
  volunteer_id: string;
  status: RegistrationStatus;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      activities: {
        Row: Activity;
        Insert: Omit<Activity, "id" | "created_at">;
        Update: Partial<Omit<Activity, "id" | "created_at">>;
        Relationships: [];
      };
      registrations: {
        Row: Registration;
        Insert: Omit<Registration, "id" | "created_at">;
        Update: Partial<Omit<Registration, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      account_status: AccountStatus;
      registration_status: RegistrationStatus;
      staff_position: StaffPosition;
      user_role: UserRole;
      yilan_region: YilanRegion;
    };
    CompositeTypes: Record<string, never>;
  };
}
