-- =========================================================
-- 志工管理平台 11_harden_cancel_and_checkin.sql（資安修補）
-- 內容：
--   (A) rpc_request_cancel：場次已開始/結束後禁止申請取消
--       —— 修補「缺席後補送取消轉 cancel_pending 以規避自動黑名單」漏洞
--   (B) rpc_self_check_in：簽到前重驗志工狀態（停權/黑名單不得簽到）
-- 前置：01 → 02 → 03 → 04（本檔以 CREATE OR REPLACE 覆蓋 04 的兩支函式）
-- 冪等：可重複貼入 Supabase SQL Editor 執行；CREATE OR REPLACE 會保留既有 GRANT。
-- =========================================================

-- ---------------------------------------------------------
-- (A) 志工申請取消（修補版）
--     新增守衛：場次已開始（start_at <= now()）即拒絕。
--     過去/進行中場次無法再轉 cancel_pending，缺席維持 approved，
--     交由 job_attendance_scan 正常計缺席＋黑名單。
--     其餘邏輯與 04_rpc_functions.sql 之定義完全相同。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_request_cancel(p_registration_id uuid)
RETURNS registration_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg record;
  v_need_review boolean;
BEGIN
  SELECT r.*, s.start_at, a.cancel_review_window_days
    INTO v_reg
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  JOIN public.activities a ON a.id = s.activity_id
  WHERE r.id = p_registration_id AND r.volunteer_id = v_uid
  FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION '找不到您的這筆報名'; END IF;

  -- 修補：場次已開始/結束後不得申請取消；
  -- 未出席者應維持 approved，由排程依規則計缺席，不得藉取消規避黑名單。
  IF v_reg.start_at <= now() THEN
    RAISE EXCEPTION '場次已開始，無法申請取消（未出席將依規則計缺席）';
  END IF;

  IF v_reg.status = 'pending' THEN
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = 'volunteer_self',
        cancel_requested_at = now(), cancelled_at = now()
    WHERE id = p_registration_id;
    RETURN 'cancelled';
  END IF;

  IF v_reg.status <> 'approved' THEN
    RAISE EXCEPTION '此報名目前狀態（%）無法申請取消', v_reg.status;
  END IF;

  -- N=0：任何時候取消都需審核；否則場次開始前 N 天內需審核
  v_need_review := (v_reg.cancel_review_window_days = 0)
    OR (now() >= v_reg.start_at - make_interval(days => v_reg.cancel_review_window_days));

  IF v_need_review THEN
    UPDATE public.registrations
    SET status = 'cancel_pending', cancel_requested_at = now()
    WHERE id = p_registration_id;
    RETURN 'cancel_pending';
  ELSE
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = 'volunteer_self',
        cancel_requested_at = now(), cancelled_at = now()
    WHERE id = p_registration_id;   -- 名額為計數式，立即自然釋出
    RETURN 'cancelled';
  END IF;
END $$;

-- ---------------------------------------------------------
-- (B) 志工自行簽到（修補版）
--     新增守衛：簽到前重驗志工為 active 且未在黑名單
--     （比照 rpc_register_for_session 的帳號狀態檢查），
--     避免核准後被停權/黑名單者仍對進行中場次簽到累計時數。
--     其餘邏輯與 04_rpc_functions.sql 之定義完全相同。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_self_check_in(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg record;
  v_open_min integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  -- 修補：停權/黑名單者不得簽到
  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = v_uid AND status = 'active' AND is_blacklisted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION '目前帳號狀態無法簽到（停權或黑名單期間）';
  END IF;

  SELECT self_checkin_open_minutes_before INTO v_open_min FROM public.system_settings;

  SELECT r.*, s.start_at, s.end_at, s.cancelled_at AS session_cancelled_at
    INTO v_reg
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  WHERE r.id = p_registration_id AND r.volunteer_id = v_uid
  FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION '找不到您的這筆報名'; END IF;
  IF v_reg.status <> 'approved' THEN RAISE EXCEPTION '僅核准的報名可簽到'; END IF;
  IF v_reg.session_cancelled_at IS NOT NULL THEN RAISE EXCEPTION '此場次已取消'; END IF;
  IF v_reg.attendance IS NOT NULL THEN RAISE EXCEPTION '出席狀態已登記'; END IF;
  IF now() < v_reg.start_at - make_interval(mins => v_open_min)
     OR now() > v_reg.end_at THEN
    RAISE EXCEPTION '不在簽到時間內（場次開始前 % 分鐘至結束）', v_open_min;
  END IF;

  UPDATE public.registrations
  SET attendance = 'attended', checked_in_at = now()   -- attendance_recorded_by 留 NULL＝本人
  WHERE id = p_registration_id;                        -- service_hours 由 trigger 帶入
END $$;
