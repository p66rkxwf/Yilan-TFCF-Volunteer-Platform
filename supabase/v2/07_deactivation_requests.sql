-- =========================================================
-- 志工管理平台 07_deactivation_requests.sql
-- 內容：志工帳號停用申請（志工發起 → 管理員審核）
-- 前置：01 → 02 → 03 → 04（沿用 fn_is_admin() / fn_is_staff() / fn_audit() /
--       fn_notify() / fn_set_updated_at() / fn_cascade_cancel_future_registrations()）
--
-- 設計原則：
-- - 與 registrations 同慣例：本表無直寫 policy，寫入一律走本檔 RPC
-- - 一位志工同時最多一筆待處理申請（partial unique index）
-- - 核准＝比照 rpc_update_volunteer_status('suspended') 的語意：
--   狀態轉 suspended ＋ 級聯取消「場次尚未開始」的有效報名
--
-- 執行方式（務必分兩步！）：
-- Postgres 限制「同一交易內」不可新增 enum 值後立即使用；Supabase SQL Editor
-- 對貼入內容以單一隱含交易執行，故本檔的 ALTER TYPE 與後續 RPC 不能一次貼完執行。
--   STEP 1：選取並執行「STEP 1」區塊，確認成功
--   STEP 2：再選取並執行「STEP 2」區塊（其餘全部）
-- =========================================================

-- ---------------------------------------------------------
-- STEP 1：ENUM 型別（請先單獨執行本區塊並確認成功）
-- ---------------------------------------------------------
CREATE TYPE deactivation_request_status AS ENUM
  ('pending', 'approved', 'rejected', 'withdrawn');

-- notification_type 補值：志工提出停用申請／申請審核結果
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'deactivation_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'deactivation_review_result';

-- ---------------------------------------------------------
-- STEP 2：資料表、RLS、RPC（STEP 1 成功並 commit 後才執行本區塊）
-- ---------------------------------------------------------

-- 2.1 資料表（deactivation_requests）
CREATE TABLE public.deactivation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL,
  reason text,
  status deactivation_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deactivation_requests_pkey PRIMARY KEY (id),
  CONSTRAINT deactivation_requests_volunteer_id_fkey
    FOREIGN KEY (volunteer_id) REFERENCES public.volunteer_profiles(id),
  CONSTRAINT deactivation_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.staff_profiles(id),
  -- 審核結果（approved/rejected）與審核人/時間 一對一綁定
  CONSTRAINT deactivation_review_consistency
    CHECK ((status IN ('approved', 'rejected'))
           = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

-- 一位志工同時最多一筆待處理申請
CREATE UNIQUE INDEX deactivation_requests_one_pending_per_volunteer
  ON public.deactivation_requests (volunteer_id)
  WHERE status = 'pending';

CREATE INDEX deactivation_requests_volunteer_idx ON public.deactivation_requests (volunteer_id);
CREATE INDEX deactivation_requests_status_idx ON public.deactivation_requests (status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.deactivation_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 2.2 RLS：唯讀，寫入全走 RPC（比照 registrations 慣例）
ALTER TABLE public.deactivation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY deactivation_requests_select_own ON public.deactivation_requests
  FOR SELECT USING (volunteer_id = auth.uid());

CREATE POLICY deactivation_requests_select_staff ON public.deactivation_requests
  FOR SELECT USING (public.fn_is_staff());

-- 2.3 RPC

-- (a) 志工提出停用申請：僅在職（active）志工可申請，且同時最多一筆待處理
CREATE OR REPLACE FUNCTION public.rpc_request_deactivation(p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_worker_id uuid;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  SELECT assigned_worker_id INTO v_worker_id
  FROM public.volunteer_profiles
  WHERE id = v_uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION '僅在職志工可提出停用申請'; END IF;

  PERFORM 1 FROM public.deactivation_requests
   WHERE volunteer_id = v_uid AND status = 'pending';
  IF FOUND THEN RAISE EXCEPTION '您已有一筆待處理的停用申請'; END IF;

  INSERT INTO public.deactivation_requests (volunteer_id, reason)
  VALUES (v_uid, p_reason)
  RETURNING id INTO v_request_id;

  PERFORM public.fn_audit('request_deactivation', 'deactivation_requests', v_request_id, NULL);

  IF v_worker_id IS NOT NULL THEN
    PERFORM public.fn_notify(v_worker_id, 'deactivation_requested',
      jsonb_build_object('request_id', v_request_id, 'volunteer_id', v_uid));
  END IF;

  RETURN v_request_id;
END $$;

-- (b) 志工撤回自己待處理的申請
CREATE OR REPLACE FUNCTION public.rpc_withdraw_deactivation_request()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  SELECT * INTO v_req FROM public.deactivation_requests
   WHERE volunteer_id = v_uid AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到待處理的停用申請'; END IF;

  UPDATE public.deactivation_requests
  SET status = 'withdrawn'
  WHERE id = v_req.id;

  PERFORM public.fn_audit('withdraw_deactivation_request', 'deactivation_requests', v_req.id, NULL);
END $$;

-- (c) 管理員審核：核准 → 停權＋級聯取消未來報名；駁回 → 維持在職
CREATE OR REPLACE FUNCTION public.rpc_review_deactivation_request(
  p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_req record;
  v_cancelled integer;
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;

  SELECT * INTO v_req FROM public.deactivation_requests
   WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '此申請不存在或非待處理狀態'; END IF;

  UPDATE public.deactivation_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END::deactivation_request_status,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  WHERE id = p_request_id;

  IF p_approve THEN
    PERFORM set_config('app.bypass_profile_guard', 'on', true);
    UPDATE public.volunteer_profiles
    SET status = 'suspended'
    WHERE id = v_req.volunteer_id AND status = 'active';

    v_cancelled := public.fn_cascade_cancel_future_registrations(
      v_req.volunteer_id, 'admin_removed', 'registration_cancelled_by_admin');
  END IF;

  PERFORM public.fn_audit(
    CASE WHEN p_approve THEN 'approve_deactivation_request' ELSE 'reject_deactivation_request' END,
    'deactivation_requests', p_request_id,
    jsonb_build_object('cascade_cancelled', COALESCE(v_cancelled, 0)));

  PERFORM public.fn_notify(v_req.volunteer_id, 'deactivation_review_result',
    jsonb_build_object('request_id', p_request_id, 'approved', p_approve));
END $$;

-- 2.4 權限收斂：撤銷預設 EXECUTE，逐一授權（比照 04 慣例）
REVOKE EXECUTE ON FUNCTION
  public.rpc_request_deactivation(text),
  public.rpc_withdraw_deactivation_request(),
  public.rpc_review_deactivation_request(uuid, boolean, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.rpc_request_deactivation(text),
  public.rpc_withdraw_deactivation_request(),
  public.rpc_review_deactivation_request(uuid, boolean, text)
TO authenticated;
