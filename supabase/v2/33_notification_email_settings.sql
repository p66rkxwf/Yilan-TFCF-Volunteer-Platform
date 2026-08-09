-- =========================================================
-- 志工管理平台 33_notification_email_settings.sql（寄信開關，兩層）
-- 用途：有些通知寄 mail 太吵（例如每一筆新報名都寄給所有主辦人、
--   審核提醒每人每場每日一封），需要能關掉「寄信」但保留站內通知。
--
-- 兩層設計：
--   (a) 全站層：system_settings.email_disabled_types（system_admin 可改）
--   (b) 個人層：notification_email_prefs.disabled_types（收件人自己可改）
--   任一層命中即不寄信。志工與職員共用同一張個人偏好表（key 為 auth.users）。
--
-- 為何存「關閉清單」而非「開啟清單」：預設 '{}' 即等於全部開啟，
--   上線後行為與現況完全一致；未來新增通知型別也自動預設開啟，不需回填。
--
-- 站內通知完全不受影響：15_notification_center.sql 已確立 read_at 與 status
--   正交、「通知不論信寄成敗都應在站內可見」，通知中心只依 recipient_user_id
--   與 read_at 過濾，從不看 status。
--
-- 'email_verification'（Email OTP）強制寄送：它與其他通知走同一條 outbox
--   （21_email_verification.sql），關掉會讓註冊與自行簽到直接壞掉。
--   三重防護：本檔的 CHECK、前端不列出、worker 硬跳過。
--
-- 前置：01 → 03 → 15 → 23。
-- 冪等：全檔 IF NOT EXISTS / DROP-CREATE，可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 新增 'skipped' 寄送狀態（＝因設定而未寄，非失敗）
--    必須是 pending 以外的終端狀態，否則被跳過的列會永遠留在 pending：
--    worker 每 60 秒重掃一次，而 23 的清理只刪 status <> 'pending'，
--    這張表會無限成長。
--    註：PG 12+ 允許在交易內 ADD VALUE，但同一交易內不可「使用」該值；
--    本檔沒有任何地方寫出這個字面值，故整檔一次執行安全。
-- ---------------------------------------------------------
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'skipped';

-- ---------------------------------------------------------
-- 2. 全站層：單列 system_settings 加一欄（比照 23 的加設定慣例）
--    用 notification_type[] 而非 text[]：非法值在寫入時就被擋掉，
--    且未來 ALTER TYPE ADD VALUE 自動涵蓋。
-- ---------------------------------------------------------
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS email_disabled_types notification_type[] NOT NULL DEFAULT '{}'
    CHECK (NOT ('email_verification' = ANY (email_disabled_types)));

-- 讀限職員、寫限系統管理員：沿用 03_rls_policies.sql 既有的
-- settings_select / settings_update policy，本檔不需另開。
-- （志工讀不到 system_settings，故個人設定頁只顯示個人層開關。）

-- ---------------------------------------------------------
-- 3. 個人層：收件人自己的寄信偏好（志工與職員共用）
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_email_prefs (
  user_id uuid NOT NULL,
  disabled_types notification_type[] NOT NULL DEFAULT '{}'
    CHECK (NOT ('email_verification' = ANY (disabled_types))),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_prefs_pkey PRIMARY KEY (user_id),
  CONSTRAINT notification_email_prefs_user_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS set_updated_at ON public.notification_email_prefs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notification_email_prefs
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------
-- 4. RLS：只能讀寫自己那一列（比照 15 的寫法）
--    這裡開 INSERT/UPDATE 直寫（不像 notification_outbox 走 RPC），因為
--    本表只有一個使用者自有欄位，沒有 status/error 這類不可被使用者動的欄位。
--    不開 DELETE：留列即可（清空 disabled_types 等同全部開啟）。
-- ---------------------------------------------------------
ALTER TABLE public.notification_email_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_prefs_select_own ON public.notification_email_prefs;
CREATE POLICY email_prefs_select_own ON public.notification_email_prefs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS email_prefs_insert_own ON public.notification_email_prefs;
CREATE POLICY email_prefs_insert_own ON public.notification_email_prefs
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS email_prefs_update_own ON public.notification_email_prefs;
CREATE POLICY email_prefs_update_own ON public.notification_email_prefs
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.notification_email_prefs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.notification_email_prefs TO authenticated;

-- 發信 worker 使用 service_role（天然繞過 RLS），不受本檔影響。

-- ---------------------------------------------------------
-- 5. 清理：23 的通知清理條件已是 status <> 'pending'，
--    'skipped' 自動被涵蓋，無需修改 job_purge_expired。
-- ---------------------------------------------------------

NOTIFY pgrst, 'reload schema';
