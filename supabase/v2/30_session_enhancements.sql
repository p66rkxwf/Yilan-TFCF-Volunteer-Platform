-- =========================================================
-- 志工管理平台 30_session_enhancements.sql
-- 需求（2026-07）：活動模組強化
--   (1) 場次類型 session_type：'regular'（正式，可報名）/ 'briefing'（行前說明會，
--       純資訊、不可報名、不計時數）。說明會沿用場次的時間結構，但：
--         · v_session_open_slots 過濾掉說明會（不佔名額、不出現在可報名清單）。
--         · rpc_register_for_session 防呆：拒絕對說明會報名（擋掉繞過前端者）。
--       因說明會無法報名 → 無 registrations → 自動不進出席/時數/報表/憑證（皆經 registrations 串接）。
--   (2) 場次地點覆寫 location：NULL＝沿用活動主要地點（activities.location）；有值＝該場次改於此地點。
--   (3) 場次補充說明 note：選填，主要供行前說明會顯示（如「請攜帶…」「線上連結…」）。
-- 前置：01（activity_sessions）→ 06/14/23（v_session_open_slots）→ 04/21（rpc_register_for_session）。
-- 單步執行即可（未新增 enum，採 text + CHECK）。
--
-- 備註：既有 session_no_overlap 排他約束（同活動時段不重疊）對所有類型一體適用，
--   故行前說明會不可與同活動的其他場次時段重疊——實務上說明會多在活動前，尚可接受。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 場次新增欄位
-- ---------------------------------------------------------
ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'regular'
    CHECK (session_type IN ('regular', 'briefing'));

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS location text;   -- NULL = 沿用 activities.location

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS note text;        -- 選填補充說明（主要供行前說明會）

-- ---------------------------------------------------------
-- 2. 重建 v_session_open_slots：排除行前說明會（同 23，僅多一個 session_type 過濾）
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW public.v_session_open_slots
WITH (security_invoker = off) AS
SELECT
  s.id AS activity_session_id,
  s.activity_id,
  s.start_at,
  s.end_at,
  s.capacity,
  s.registration_deadline_at,
  (s.cancelled_at IS NOT NULL) AS session_cancelled,
  s.capacity - count(r.id) FILTER (
    WHERE r.status IN ('pending', 'approved', 'cancel_pending')
  ) AS open_slots
FROM public.activity_sessions s
JOIN public.activities a ON a.id = s.activity_id
LEFT JOIN public.registrations r ON r.activity_session_id = s.id
WHERE a.status <> 'draft' AND a.deleted_at IS NULL
  AND s.session_type = 'regular'
GROUP BY s.id, s.activity_id, s.start_at, s.end_at, s.capacity,
         s.registration_deadline_at, s.cancelled_at;
REVOKE ALL ON public.v_session_open_slots FROM anon;
GRANT SELECT ON public.v_session_open_slots TO authenticated;

-- ---------------------------------------------------------
-- 3. 重建 rpc_register_for_session：加行前說明會防呆（其餘與 21 完全相同）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_register_for_session(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.activity_sessions%ROWTYPE;
  v_activity_status activity_status;
  v_taken integer;
  v_reg_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = v_uid AND status = 'active' AND is_blacklisted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION '目前帳號狀態無法報名（待審核、停權或黑名單期間）';
  END IF;

  -- Email 驗證關卡（未驗證聯絡信箱不得報名）
  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = v_uid AND email_verified_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '請先完成 Email 驗證後才能報名（帳號設定 → 驗證 Email）';
  END IF;

  -- 鎖 1：序列化同一志工的所有報名 → 保護時間衝突檢查
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- 鎖 2：序列化同一場次的名額判斷
  SELECT * INTO v_session FROM public.activity_sessions
   WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '場次不存在'; END IF;

  -- 行前說明會為純資訊場次，無需（也無法）報名
  IF v_session.session_type <> 'regular' THEN
    RAISE EXCEPTION '此場次為行前說明會，無需報名';
  END IF;

  IF v_session.cancelled_at IS NOT NULL THEN RAISE EXCEPTION '此場次已取消'; END IF;
  IF now() > v_session.registration_deadline_at THEN RAISE EXCEPTION '已超過報名截止時間'; END IF;

  SELECT status INTO v_activity_status FROM public.activities
   WHERE id = v_session.activity_id;
  IF v_activity_status <> 'open' THEN RAISE EXCEPTION '活動未開放報名'; END IF;

  SELECT count(*) INTO v_taken FROM public.registrations
   WHERE activity_session_id = p_session_id
     AND status IN ('pending', 'approved', 'cancel_pending');
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION '此場次名額已滿'; END IF;

  PERFORM 1
  FROM public.registrations r
  JOIN public.activity_sessions s2 ON s2.id = r.activity_session_id
  WHERE r.volunteer_id = v_uid
    AND r.status IN ('pending', 'approved', 'cancel_pending')
    AND s2.cancelled_at IS NULL
    AND tstzrange(s2.start_at, s2.end_at) && tstzrange(v_session.start_at, v_session.end_at);
  IF FOUND THEN RAISE EXCEPTION '時間衝突：您已報名重疊時段的其他場次'; END IF;

  INSERT INTO public.registrations (activity_session_id, volunteer_id, status)
  VALUES (p_session_id, v_uid, 'pending')
  RETURNING id INTO v_reg_id;

  RETURN v_reg_id;
END $$;

NOTIFY pgrst, 'reload schema';
