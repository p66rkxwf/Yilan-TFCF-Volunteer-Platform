-- =========================================================
-- 志工管理平台 01_schema.sql（定案版）
-- 內容：extensions、ENUM、資料表、約束、索引
-- 執行順序：01 → 02 → 03 → 04 → 05
-- 目標環境：Supabase (PostgreSQL 15+)
-- =========================================================

-- ---------------------------------------------------------
-- 0. Extensions
-- 裝在獨立的 extensions schema、不裝在 public，避免 public schema
-- 混入非自有物件（Supabase linter：extension_in_public）。
-- Supabase 專案的預設角色 search_path 已包含 extensions，
-- 下方 EXCLUDE USING gist 約束建立當下即可正常解析對應的運算子類別。
-- ---------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;   -- EXCLUDE 約束需要（uuid = 搭配 range &&）
-- 不需啟用 pg_cron：排程由 Cloudflare Cron Worker 觸發（見 05 §G 與 12）

-- ---------------------------------------------------------
-- 1. ENUM 型別
-- ---------------------------------------------------------
CREATE TYPE staff_role AS ENUM ('system_admin', 'unit_admin', 'staff');
CREATE TYPE staff_account_status AS ENUM ('active', 'suspended');
CREATE TYPE staff_job_title AS ENUM ('social_worker', 'other'); -- 依機構實際職稱補齊

-- 志工狀態：合併原 is_graduated，並補上帳號審核流程需要的狀態
-- pending_review = 自主註冊後待管理員審核；rejected = 審核未通過（保留紀錄）
-- graduated = 已畢業/結案（保留資料與登入，僅停止報名；登入不停用）
-- 黑名單「不在」此 enum：唯一事實來源為 blacklist_events，
-- volunteer_profiles.is_blacklisted 為 trigger 維護的唯讀鏡像欄位
CREATE TYPE volunteer_status AS ENUM
  ('pending_review', 'active', 'suspended', 'graduated', 'rejected');

CREATE TYPE grade_level AS ENUM
  ('junior_high', 'senior_high', 'university', 'graduate_school', 'doctorate');

CREATE TYPE activity_status AS ENUM ('draft', 'open', 'closed', 'completed', 'cancelled');

-- expired = 活動場次結束後仍未審核的報名，由排程標記（僅活動後；活動前逾期只提醒不自動處理）
CREATE TYPE registration_status AS ENUM
  ('pending', 'approved', 'rejected', 'cancel_pending', 'cancelled', 'expired');

CREATE TYPE attendance_status AS ENUM ('attended', 'absent', 'makeup_attended');
CREATE TYPE announcement_status AS ENUM ('draft', 'published', 'unpublished');
CREATE TYPE activity_type AS ENUM ('general', 'custom');

-- 取消原因（status 管生命週期、reason 管來源，正交設計）
CREATE TYPE cancel_reason AS ENUM (
  'volunteer_self',      -- 志工自行取消（有無經審核看 cancel_reviewed_by 是否有值）
  'blacklist_cascade',   -- 列入黑名單連動取消
  'activity_cancelled',  -- 整場活動取消
  'session_cancelled',   -- 單一場次取消
  'admin_removed'        -- 停權/畢業等管理員操作連動取消
);

CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE notification_type AS ENUM (
  'account_review_result',        -- 志工帳號審核結果
  'registration_review_result',   -- 報名審核結果
  'cancel_review_result',         -- 取消報名審核結果
  'blacklist_added',              -- 列入黑名單（含預計解除日）
  'blacklist_cascade_cancelled',  -- 因黑名單被連動取消的報名
  'review_reminder',              -- 報名審核提醒（發主辦人）
  'activity_reminder',            -- 活動開始前提醒（發志工）
  'activity_cancelled',           -- 整場活動取消
  'session_cancelled',            -- 單場次取消
  'session_time_changed',         -- 場次時間異動（#26b）
  'schedule_conflict_alert',      -- 時間異動後偵測到衝突（#26b，發志工＋主辦人）
  'registration_cancelled_by_admin' -- 停權/畢業等管理操作連動取消（#24a）
);

-- ---------------------------------------------------------
-- 2. 職員資料表（staff_profiles）
-- ---------------------------------------------------------
-- 政策：職員永不硬刪（改 status='suspended'），否則歷史活動/審核紀錄的 FK 會卡死
CREATE TABLE public.staff_profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  phone text NOT NULL,                      -- 必填：主辦人電話會公開於前台
  region text,                              -- 【待補充】固定選項清單確定後改 ENUM
  role staff_role NOT NULL DEFAULT 'staff',
  job_title staff_job_title NOT NULL,
  status staff_account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT staff_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT staff_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
-- 備註：建立職員帳號需先經 Supabase Admin API / Dashboard 建 auth.users，
-- 再插入本表，屬伺服器端管理流程，不開放前端直接 INSERT。

-- ---------------------------------------------------------
-- 3. 志工資料表（volunteer_profiles）
-- ---------------------------------------------------------
CREATE TABLE public.volunteer_profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  birth_date date NOT NULL,
  email text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  phone text NOT NULL,                      -- 新增：社工需可聯繫志工
  region text,
  grade grade_level NOT NULL,               -- 既有學籍事實資料，非評核分級
  status volunteer_status NOT NULL DEFAULT 'pending_review',
  is_blacklisted boolean NOT NULL DEFAULT false, -- 唯讀鏡像，由 02 trigger 依 blacklist_events 維護
  assigned_worker_id uuid,                  -- 註冊當下無人指派 → nullable，審核通過時強制帶入
  last_grade_reviewed_at timestamptz,       -- 年度審查紀錄時間
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT volunteer_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT volunteer_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT volunteer_profiles_assigned_worker_id_fkey
    FOREIGN KEY (assigned_worker_id) REFERENCES public.staff_profiles(id),
  -- 待審/已拒絕可無負責社工；其餘狀態必須有
  CONSTRAINT volunteer_assigned_worker_required
    CHECK (status IN ('pending_review', 'rejected') OR assigned_worker_id IS NOT NULL)
);
-- assigned_worker 須為在職社工 → 02 trigger 檢查（DB 約束無法跨表比對欄位值）

CREATE INDEX volunteer_profiles_assigned_worker_idx ON public.volunteer_profiles (assigned_worker_id);
CREATE INDEX volunteer_profiles_status_idx ON public.volunteer_profiles (status);

-- ---------------------------------------------------------
-- 4. 期間表（periods）
-- ---------------------------------------------------------
CREATE TABLE public.periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,               -- 例：'115上'，供報表顯示
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periods_pkey PRIMARY KEY (id),
  CONSTRAINT periods_date_check CHECK (end_date > start_date),
  -- 期間不得重疊（含端點；CHECK 做不到跨列，需 EXCLUDE）
  CONSTRAINT periods_no_overlap
    EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

-- ---------------------------------------------------------
-- 5. 最低服務時數門檻（依年級，全域固定）
-- ---------------------------------------------------------
CREATE TABLE public.grade_hour_thresholds (
  grade grade_level NOT NULL,
  min_hours numeric NOT NULL CHECK (min_hours >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grade_hour_thresholds_pkey PRIMARY KEY (grade)
);

-- ---------------------------------------------------------
-- 6. 畢業參考年齡對照表（grade_reference_ages）
-- 年齡基準日：每年 8/31；reference_age = NULL → 該階段全數列入年度審查清單
-- ---------------------------------------------------------
CREATE TABLE public.grade_reference_ages (
  grade grade_level NOT NULL,
  reference_age integer CHECK (reference_age IS NULL OR reference_age > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grade_reference_ages_pkey PRIMARY KEY (grade)
);

-- 建議初始資料（國中15／高中18／大學22／研究所、博士 NULL）
INSERT INTO public.grade_reference_ages (grade, reference_age) VALUES
  ('junior_high', 15), ('senior_high', 18), ('university', 22),
  ('graduate_school', NULL), ('doctorate', NULL);

-- ---------------------------------------------------------
-- 7. 系統參數表（system_settings，單列設計）
-- ---------------------------------------------------------
CREATE TABLE public.system_settings (
  id integer NOT NULL DEFAULT 1,
  blacklist_auto_release_days integer NOT NULL DEFAULT 30 CHECK (blacklist_auto_release_days > 0),
  makeup_attendance_grace_days integer NOT NULL DEFAULT 3 CHECK (makeup_attendance_grace_days >= 0),
  review_reminder_days_before integer NOT NULL DEFAULT 3 CHECK (review_reminder_days_before >= 0),
  self_checkin_open_minutes_before integer NOT NULL DEFAULT 30 CHECK (self_checkin_open_minutes_before >= 0), -- #27 自行簽到提前開放分鐘數
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_pkey PRIMARY KEY (id),
  CONSTRAINT system_settings_singleton CHECK (id = 1)
);
INSERT INTO public.system_settings DEFAULT VALUES;

-- ---------------------------------------------------------
-- 8. 活動表（activities）
-- 日期/時間/名額/截止 全部下移到場次層（activity_sessions）
-- ---------------------------------------------------------
CREATE TABLE public.activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,               -- 建立者，單一；主辦人另見 activity_organizers
  title text NOT NULL,
  content text,
  activity_type activity_type NOT NULL DEFAULT 'general',
  location text NOT NULL,
  cancel_review_window_days integer NOT NULL DEFAULT 0 CHECK (cancel_review_window_days >= 0),
    -- 「該場次」開始前 N 天內取消需審核；0 = 任何時候取消都需審核。錨點＝各場次 start_at
  status activity_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_pkey PRIMARY KEY (id),
  CONSTRAINT activities_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staff_profiles(id)
);
CREATE INDEX activities_created_by_idx ON public.activities (created_by);
CREATE INDEX activities_status_idx ON public.activities (status);

-- ---------------------------------------------------------
-- 9. 活動場次表（activity_sessions）★ 新表
-- 一個活動多天多時段；名額、報名、出席、時數皆以「場次」為單位
-- ---------------------------------------------------------
CREATE TABLE public.activity_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),          -- 每場獨立名額
  registration_deadline_at timestamptz NOT NULL,               -- #16A：到點自動不可報名；02 trigger 未給值時預設 = start_at
  cancelled_at timestamptz,                                 -- 單場次取消（颱風等）；NULL = 正常
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT activity_sessions_activity_id_fkey
    FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE,
    -- CASCADE 僅在「草稿活動整筆刪除」時生效；有報名的場次會被 registrations 的 FK 擋下
  CONSTRAINT session_time_check CHECK (end_at > start_at),
  CONSTRAINT session_deadline_check CHECK (registration_deadline_at <= start_at),
  -- 同活動場次禁時段重疊（若日後需「同時段平行分組」，移除此約束即可）
  CONSTRAINT session_no_overlap EXCLUDE USING gist
    (activity_id WITH =, tstzrange(start_at, end_at) WITH &&)
    WHERE (cancelled_at IS NULL)
);
CREATE INDEX activity_sessions_activity_idx ON public.activity_sessions (activity_id);
CREATE INDEX activity_sessions_start_idx ON public.activity_sessions (start_at);
-- 出席/黑名單排程掃描用
CREATE INDEX activity_sessions_scan_idx ON public.activity_sessions (end_at)
  WHERE cancelled_at IS NULL;

-- ---------------------------------------------------------
-- 10. 報名表（registrations）— 一筆報名 = 一個場次
-- ---------------------------------------------------------
CREATE TABLE public.registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  activity_session_id uuid NOT NULL,
  volunteer_id uuid NOT NULL,
  status registration_status NOT NULL DEFAULT 'pending',
  -- 出席（該場次）
  attendance attendance_status,
  checked_in_at timestamptz,
  attendance_recorded_by uuid,                       -- 管理員代登/補登操作人；志工自行簽到為 NULL
  service_hours numeric CHECK (service_hours IS NULL OR service_hours > 0), -- 出席確定時由 02 trigger 依場次時長自動帶入（歷史紀錄）
  -- 報名審核
  reviewed_by uuid,
  reviewed_at timestamptz,
  -- 取消流程
  cancel_requested_at timestamptz,
  cancel_reviewed_by uuid,
  cancel_reviewed_at timestamptz,
  cancel_reason cancel_reason,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registrations_pkey PRIMARY KEY (id),
  CONSTRAINT registrations_activity_session_id_fkey
    FOREIGN KEY (activity_session_id) REFERENCES public.activity_sessions(id),
  CONSTRAINT registrations_volunteer_id_fkey
    FOREIGN KEY (volunteer_id) REFERENCES public.volunteer_profiles(id),
  CONSTRAINT registrations_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.staff_profiles(id),
  CONSTRAINT registrations_attendance_recorded_by_fkey
    FOREIGN KEY (attendance_recorded_by) REFERENCES public.staff_profiles(id),
  CONSTRAINT registrations_cancel_reviewed_by_fkey
    FOREIGN KEY (cancel_reviewed_by) REFERENCES public.staff_profiles(id),
  -- 取消狀態與原因/時間 一對一綁定
  CONSTRAINT reg_cancel_reason_consistency
    CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL)),
  CONSTRAINT reg_cancelled_at_consistency
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  -- 出席與時數綁定：有出席必有時數、缺席必無時數
  CONSTRAINT reg_attendance_hours CHECK (
       (attendance IN ('attended', 'makeup_attended') AND service_hours IS NOT NULL)
    OR (attendance = 'absent' AND service_hours IS NULL)
    OR (attendance IS NULL AND service_hours IS NULL)
  ),
  -- 僅核准的報名能有出席結果；副作用：已出席的歷史紀錄無法被改成取消
  CONSTRAINT reg_attendance_requires_approved
    CHECK (attendance IS NULL OR status = 'approved'),
  -- 補登必有操作人
  CONSTRAINT reg_makeup_requires_operator
    CHECK (attendance IS DISTINCT FROM 'makeup_attended' OR attendance_recorded_by IS NOT NULL)
);

-- 同一志工對同一場次僅一筆有效報名（取消/拒絕/過期後可重報）
CREATE UNIQUE INDEX registrations_unique_active_signup
  ON public.registrations (activity_session_id, volunteer_id)
  WHERE status NOT IN ('cancelled', 'rejected', 'expired');

CREATE INDEX registrations_activity_session_idx ON public.registrations (activity_session_id);
CREATE INDEX registrations_volunteer_idx ON public.registrations (volunteer_id);
CREATE INDEX registrations_reviewed_by_idx ON public.registrations (reviewed_by);
CREATE INDEX registrations_attendance_recorded_by_idx ON public.registrations (attendance_recorded_by);
CREATE INDEX registrations_cancel_reviewed_by_idx ON public.registrations (cancel_reviewed_by);
-- 名額計算／衝突檢查熱路徑
CREATE INDEX registrations_active_by_activity_session_idx ON public.registrations (activity_session_id)
  WHERE status IN ('pending', 'approved', 'cancel_pending');
CREATE INDEX registrations_active_by_volunteer_idx ON public.registrations (volunteer_id)
  WHERE status IN ('pending', 'approved', 'cancel_pending');

-- ---------------------------------------------------------
-- 11. 收藏表（favorites）— 維持活動層級
-- ---------------------------------------------------------
CREATE TABLE public.favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorites_pkey PRIMARY KEY (id),
  CONSTRAINT favorites_volunteer_id_fkey
    FOREIGN KEY (volunteer_id) REFERENCES public.volunteer_profiles(id),
  CONSTRAINT favorites_activity_id_fkey
    FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE,
  CONSTRAINT favorites_unique UNIQUE (volunteer_id, activity_id)
);
CREATE INDEX favorites_activity_idx ON public.favorites (activity_id);

-- ---------------------------------------------------------
-- 12. 黑名單事件紀錄表（blacklist_events）— 唯一事實來源
-- ---------------------------------------------------------
CREATE TABLE public.blacklist_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL,
  registration_id uuid,                     -- 觸發此事件的報名；手動加入可為 NULL
  triggered_at timestamptz NOT NULL DEFAULT now(),
  expected_release_at timestamptz NOT NULL,
  released_at timestamptz,                  -- NULL = 事件生效中
  released_by uuid,                         -- NULL = 系統自動解除
  is_manual boolean NOT NULL DEFAULT false,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blacklist_events_pkey PRIMARY KEY (id),
  CONSTRAINT blacklist_events_volunteer_id_fkey
    FOREIGN KEY (volunteer_id) REFERENCES public.volunteer_profiles(id),
  CONSTRAINT blacklist_events_registration_id_fkey
    FOREIGN KEY (registration_id) REFERENCES public.registrations(id),
  CONSTRAINT blacklist_events_released_by_fkey
    FOREIGN KEY (released_by) REFERENCES public.staff_profiles(id),
  -- 自動觸發的事件必須關聯報名紀錄
  CONSTRAINT blacklist_auto_requires_registration
    CHECK (is_manual OR registration_id IS NOT NULL)
);

-- ★ 同一筆報名最多觸發一次黑名單（你的決策）＋ 排程重跑天然冪等
CREATE UNIQUE INDEX blacklist_once_per_registration
  ON public.blacklist_events (registration_id)
  WHERE registration_id IS NOT NULL;

CREATE INDEX blacklist_events_volunteer_idx ON public.blacklist_events (volunteer_id);
CREATE INDEX blacklist_events_released_by_idx ON public.blacklist_events (released_by);
-- 自動解除排程掃描用
CREATE INDEX blacklist_active_release_idx ON public.blacklist_events (expected_release_at)
  WHERE released_at IS NULL;

-- ---------------------------------------------------------
-- 13. 公告表（announcements）
-- ---------------------------------------------------------
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  status announcement_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staff_profiles(id)
);
CREATE INDEX announcements_created_by_idx ON public.announcements (created_by);
CREATE INDEX announcements_list_idx
  ON public.announcements (status, is_pinned, published_at DESC);

-- ---------------------------------------------------------
-- 14. 操作紀錄表（audit_logs）
-- 僅在 SECURITY DEFINER 函式/排程內寫入；不記錄修改前後差異
-- ---------------------------------------------------------
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,                            -- NULL = 系統自動行為
  action text NOT NULL,                     -- 'reject_registration' / 'manual_checkin' / ...
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.staff_profiles(id)
);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_id);
CREATE INDEX audit_logs_target_idx ON public.audit_logs (target_table, target_id);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at);

-- ---------------------------------------------------------
-- 15. 通知發送佇列（notification_outbox）★ 新表
-- Transactional Outbox：業務交易只寫這張表，Mail 由 worker 輪詢發送
-- ---------------------------------------------------------
CREATE TABLE public.notification_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  notification_type notification_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key text,                           -- 例 'review_reminder:{session_id}:{date}'，#28 每日去重
  status notification_status NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT notification_outbox_recipient_fkey
    FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX notification_outbox_dedup_idx
  ON public.notification_outbox (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX notification_outbox_pending_idx
  ON public.notification_outbox (created_at) WHERE status = 'pending';

-- ---------------------------------------------------------
-- 16. 活動主辦人表（activity_organizers）
-- ---------------------------------------------------------
CREATE TABLE public.activity_organizers (
  activity_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_organizers_pkey PRIMARY KEY (activity_id, staff_id),
  CONSTRAINT activity_organizers_activity_id_fkey
    FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE,
  CONSTRAINT activity_organizers_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id)
);
CREATE INDEX activity_organizers_staff_idx ON public.activity_organizers (staff_id);
