-- =========================================================
-- 志工管理平台 15_notification_center.sql（站內通知中心）
-- 用途：讓使用者在站內讀取「自己的」通知並標記已讀（header 鈴鐺＋通知頁）。
-- 前置：01（notification_outbox）→ 03（RLS enable，原本無任何 policy）。
--
-- 設計原則：
-- - notification_outbox 原為 email 發送佇列（status 是「寄送狀態」）；站內通知
--   直接複用同一張表，新增與寄送狀態「正交」的 read_at（NULL＝未讀）。
--   通知不論信寄成敗（pending/sent/failed）都應在站內可見。
-- - 只開 SELECT policy（限本人列）；「標記已讀」不開 UPDATE policy，一律走
--   SECURITY DEFINER RPC 控制可寫欄位（比照 registrations 無直寫的慣例），
--   避免使用者藉 UPDATE 動到 status/error 等發信欄位。
-- - 發信 worker 使用 service_role（天然繞過 RLS），不受本檔影響。
--
-- 執行方式：於 Supabase SQL Editor 貼上並執行本檔即可（可重複執行）。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 已讀欄位（與 email 寄送狀態正交）＋ 未讀數查詢索引
-- ---------------------------------------------------------
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS notification_outbox_unread_idx
  ON public.notification_outbox (recipient_user_id)
  WHERE read_at IS NULL;

-- 通知頁列表（本人通知依時間倒序）
CREATE INDEX IF NOT EXISTS notification_outbox_recipient_created_idx
  ON public.notification_outbox (recipient_user_id, created_at DESC);

-- ---------------------------------------------------------
-- 2. RLS：本人可讀自己的通知（僅 SELECT；寫入仍全鎖）
-- ---------------------------------------------------------
DROP POLICY IF EXISTS notification_select_own ON public.notification_outbox;
CREATE POLICY notification_select_own ON public.notification_outbox
  FOR SELECT USING (recipient_user_id = auth.uid());

-- anon 全面封鎖維持不變（03 已 REVOKE；此處確保欄位新增後亦無授權）
REVOKE ALL ON public.notification_outbox FROM anon;
GRANT SELECT ON public.notification_outbox TO authenticated;

-- ---------------------------------------------------------
-- 3. RPC：標記已讀（p_ids NULL＝全部標為已讀；只動本人的未讀列）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_mark_notifications_read(
  p_ids uuid[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  UPDATE public.notification_outbox
  SET read_at = now()
  WHERE recipient_user_id = v_uid
    AND read_at IS NULL
    AND (p_ids IS NULL OR id = ANY (p_ids));

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- 4. 權限收斂：撤銷預設 EXECUTE，僅授權 authenticated（比照 04 慣例）
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_mark_notifications_read(uuid[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_mark_notifications_read(uuid[])
TO authenticated;

-- 讓 PostgREST 立即看見新欄位/授權。
NOTIFY pgrst, 'reload schema';
