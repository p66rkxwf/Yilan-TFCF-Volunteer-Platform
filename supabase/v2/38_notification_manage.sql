-- =========================================================
-- 志工管理平台 38_notification_manage.sql（站內通知：使用者自行刪除）
-- 用途：讓使用者在通知中心刪掉自己不想再看到的通知（單則／批量／清除全部已讀）。
-- 前置：01（notification_outbox）→ 03（RLS enable）→ 15（read_at／SELECT policy）。
--
-- 設計原則：
-- - 採「軟刪除」（deleted_at）而非 DELETE。notification_outbox 同時是 email 寄送
--   佇列：status/sent_at/error 是寄信紀錄，dedup_key 的唯一索引是防重複寄信的依據。
--   硬刪會同時毀掉寄信稽核與去重保護（同一事件再觸發時會重寄一封已寄過的信）。
-- - 收緊 15 的 SELECT policy 為「本人且未刪除」：已刪除的列在資料庫層就消失，
--   鈴鐺未讀數與通知頁列表自動生效，前端不必逐處補條件。
-- - 刪除同樣不開 UPDATE policy，一律走 SECURITY DEFINER RPC（比照 15 的理由：
--   避免使用者藉直寫動到 status/error 等發信欄位）。
-- - 刪除「尚未寄出」的通知時一併把 status 轉為 'skipped'（見 RPC 內註解）：
--   否則信照樣會寄出，且該列會永遠停在 pending 而不被清除排程回收。
-- - 不必另建清理排程：23 的 job_purge_expired() 本來就會硬刪「非 pending 且超過
--   保留期」的通知，軟刪除的列仍會被回收，不會無限累積。
--
-- 執行方式：於 Supabase SQL Editor 貼上並執行本檔即可（可重複執行）。
-- 注意：本檔須「先於」前端部署 —— 前端的刪除鈕會呼叫本檔建立的 RPC。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 軟刪除欄位（與 read_at／status 皆正交）
-- ---------------------------------------------------------
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ---------------------------------------------------------
-- 2. RLS：本人可讀「未刪除」的自己那幾列
-- ---------------------------------------------------------
DROP POLICY IF EXISTS notification_select_own ON public.notification_outbox;
CREATE POLICY notification_select_own ON public.notification_outbox
  FOR SELECT USING (recipient_user_id = auth.uid() AND deleted_at IS NULL);

-- ---------------------------------------------------------
-- 3. 索引：15 建的兩支改為排除已刪除列（未讀數／列表都只看得到未刪除的）
-- ---------------------------------------------------------
DROP INDEX IF EXISTS notification_outbox_unread_idx;
CREATE INDEX notification_outbox_unread_idx
  ON public.notification_outbox (recipient_user_id)
  WHERE read_at IS NULL AND deleted_at IS NULL;

DROP INDEX IF EXISTS notification_outbox_recipient_created_idx;
CREATE INDEX notification_outbox_recipient_created_idx
  ON public.notification_outbox (recipient_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------
-- 4. RPC：軟刪除（簽章比照 rpc_mark_notifications_read）
--    p_ids 有值＝刪指定幾則（單則與批量共用）
--    p_ids NULL＝清除本人「所有已讀」。刻意不是「全部」：未讀不該被一鍵無聲刪掉。
--    SECURITY DEFINER 會繞過 RLS，故函式內自行以 recipient_user_id 限定範圍。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_delete_notifications(
  p_ids uuid[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  UPDATE public.notification_outbox
  SET deleted_at = now(),
      -- 還沒寄出就被刪掉的，一併標為 'skipped'。不這麼做會有兩個後果：
      -- worker 只撿 status='pending'，那封信照樣會寄出（使用者刪了卻仍收到）；
      -- 而 23 的 job_purge_expired 只刪「非 pending」，這一列會永遠留著不被回收。
      -- 'skipped' 的語意是「因設定而未寄、非失敗」（33），正好涵蓋此情況。
      -- 註：若 worker 剛好已讀出該列正在寄送，其回寫帶 .eq('status','pending')
      -- 會落空，結果是信已寄出但記為 skipped——不影響正確性，僅寄送紀錄略有出入。
      status = CASE WHEN status = 'pending' THEN 'skipped'::notification_status ELSE status END
  WHERE recipient_user_id = v_uid
    AND deleted_at IS NULL
    AND (CASE WHEN p_ids IS NULL THEN read_at IS NOT NULL ELSE id = ANY (p_ids) END);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- 5. 權限收斂：撤銷預設 EXECUTE，僅授權 authenticated（比照 04／15 慣例）
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_delete_notifications(uuid[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_delete_notifications(uuid[])
TO authenticated;

-- 讓 PostgREST 立即看見新欄位/授權。
NOTIFY pgrst, 'reload schema';
