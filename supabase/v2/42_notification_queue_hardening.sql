-- =========================================================
-- 志工管理平台 42_notification_queue_hardening.sql（寄信佇列：claim 鎖 + 退避重試）
--
-- 問題一：重複寄信。worker 原本的流程是
--     SELECT ... WHERE status='pending' LIMIT 50  →  寄信  →  UPDATE ... AND status='pending'
--   讀取與寄送之間沒有任何佔用標記。兩個執行個體重疊時（排程延遲、手動觸發與
--   排程撞在一起、上一輪跑超過一分鐘）會各自讀到同一列、各自寄一封，
--   第二次 UPDATE 影響 0 列——資料庫看起來只寄了一次，使用者卻收到兩封。
--   `.eq('status','pending')` 保護得了 DB 寫入，保護不了已經送到 Resend 的副作用。
--
-- 問題二：毒丸卡住佇列。暫時性失敗（429／5xx／網路）只是「保持 pending，下輪再試」，
--   沒有 attempt 計數、沒有退避、沒有上限，而取件一律 ORDER BY created_at ASC LIMIT 50。
--   於是最舊的 50 筆若持續失敗，就永遠佔著前 50 名，後面的信一封都排不到。
--   worker 端任何非 SendError 的例外預設 retryable，會讓該列永遠停在 pending。
--
-- 修補：改為標準的 claim/complete 佇列
--     rpc_claim_notifications  ：FOR UPDATE SKIP LOCKED 原子佔用，pending → processing
--     （worker 寄信）
--     rpc_complete_notification：sent / failed，或退避後放回 pending
--   取件改 ORDER BY next_attempt_at：失敗的列被排到未來，不再霸佔隊首。
--   退避 30s → 2m → 10m → 1h → 6h，第 6 次仍失敗即進 failed（dead letter）。
--   另備 job_requeue_stuck_notifications 回收「卡在 processing」的列（worker 中途死亡）。
--
-- 前置：01（notification_outbox）→ 33（'skipped' 狀態）→ 38（deleted_at）。
-- 冪等：ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE 可重複執行。
--
-- 【執行方式】須分兩步驟：Postgres 不允許在同一交易內新增 enum 值後立即使用。
--   先單獨執行 STEP 1 並確認成功，再執行 STEP 2。（比照 07／27 的慣例。）
-- 【部署順序】本檔須「先於」新版 worker 部署 —— 新 worker 會呼叫這裡建立的兩支 RPC。
--   舊 worker 在本檔套用後仍可運作（它只讀 status='pending'，不受新欄位影響），
--   故先跑 SQL、再部署 worker 是安全的。
-- =========================================================

-- =========================================================
-- STEP 1（單獨執行，確認成功後再跑 STEP 2）
-- =========================================================
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'processing';

-- =========================================================
-- STEP 2
-- =========================================================

-- ---------------------------------------------------------
-- 1. 佇列欄位
--    沿用既有的 error 欄位當 last_error，不另開欄位。
--    next_attempt_at 預設 now()：既有 pending 列立刻就緒，不會因升級而卡住。
-- ---------------------------------------------------------
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text;

-- 取件索引：改以 next_attempt_at 為主鍵序（01 的 pending_idx 只看 created_at）
DROP INDEX IF EXISTS notification_outbox_pending_idx;
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON public.notification_outbox (next_attempt_at, created_at)
  WHERE status = 'pending';

-- 回收卡住列用（processing 通常極少，索引很小）
CREATE INDEX IF NOT EXISTS notification_outbox_processing_idx
  ON public.notification_outbox (locked_at)
  WHERE status = 'processing';

-- ---------------------------------------------------------
-- 2. 佔用：pending → processing（原子，且併發安全）
--    FOR UPDATE SKIP LOCKED：多個 worker 同時取件時各自拿到不重疊的列，
--    不會互相等待，也不會拿到同一列——這正是原設計缺的那把鎖。
--    attempt_count 在佔用時就 +1（而非完成時）：worker 若在寄信途中整個掛掉，
--    這次嘗試仍被記錄，避免無限重試。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_claim_notifications(
  p_limit integer DEFAULT 50,
  p_worker text DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  recipient_user_id uuid,
  notification_type notification_type,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_outbox o
     SET status = 'processing',
         locked_at = now(),
         locked_by = p_worker,
         attempt_count = o.attempt_count + 1,
         updated_at = now()
    FROM (
      SELECT n.id
        FROM public.notification_outbox n
       WHERE n.status = 'pending'
         AND n.next_attempt_at <= now()
       ORDER BY n.next_attempt_at, n.created_at
       LIMIT greatest(p_limit, 0)
       FOR UPDATE SKIP LOCKED
    ) c
   WHERE o.id = c.id
  RETURNING o.id, o.recipient_user_id, o.notification_type, o.payload, o.attempt_count;
END $$;

-- ---------------------------------------------------------
-- 3. 完成：終態，或退避後放回 pending
--    p_status 只接受 'sent' / 'failed' / 'skipped' / 'retry'。
--    'retry' 不是 enum 值，是本 RPC 的指令：代表暫時性失敗，計算下次嘗試時間。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_complete_notification(
  p_id uuid,
  p_status text,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_attempts integer;
  v_backoff interval;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'skipped', 'retry') THEN
    RAISE EXCEPTION '未知的完成狀態：%', p_status;
  END IF;

  IF p_status = 'retry' THEN
    SELECT attempt_count INTO v_attempts
      FROM public.notification_outbox WHERE id = p_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- 退避階梯；超過階梯長度即視為毒丸，進 dead letter。
    v_backoff := CASE v_attempts
                   WHEN 1 THEN interval '30 seconds'
                   WHEN 2 THEN interval '2 minutes'
                   WHEN 3 THEN interval '10 minutes'
                   WHEN 4 THEN interval '1 hour'
                   WHEN 5 THEN interval '6 hours'
                   ELSE NULL
                 END;

    IF v_backoff IS NULL THEN
      UPDATE public.notification_outbox
         SET status = 'failed',
             error = coalesce(left(p_error, 500), '重試次數已達上限'),
             locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE id = p_id;
    ELSE
      UPDATE public.notification_outbox
         SET status = 'pending',
             next_attempt_at = now() + v_backoff,
             error = left(p_error, 500),   -- 保留最後一次錯誤，方便診斷
             locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE id = p_id;
    END IF;
    RETURN;
  END IF;

  UPDATE public.notification_outbox
     SET status = p_status::notification_status,
         sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
         error = CASE WHEN p_status = 'sent' THEN NULL ELSE left(p_error, 500) END,
         locked_at = NULL, locked_by = NULL, updated_at = now()
   WHERE id = p_id;
END $$;

-- ---------------------------------------------------------
-- 4. 回收卡住的列
--    worker isolate 若在 claim 之後、complete 之前被中斷（部署、逾時、例外逃逸），
--    該列會永遠停在 processing。超過 5 分鐘即視為失聯並放回 pending
--    （attempt_count 已在 claim 時累加，故不會無限重試）。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_requeue_stuck_notifications()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.notification_outbox
     SET status = 'pending',
         next_attempt_at = now(),
         locked_at = NULL, locked_by = NULL, updated_at = now()
   WHERE status = 'processing'
     AND locked_at < now() - interval '5 minutes';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- 5. 清理排程：別刪掉正在寄送的列
--    23 的 job_purge_expired 以 status <> 'pending' 為清理條件，新增的
--    'processing' 會落入該條件而被誤刪。改為兩者皆排除。
--    本體其餘部分同 23（僅這一段 WHERE 改動）。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_purge_expired()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.system_settings%ROWTYPE;
  v_arch integer := 0; v_tmp integer := 0;
  v_notif integer := 0; v_audit integer := 0; v_reg integer := 0;
BEGIN
  SELECT * INTO s FROM public.system_settings;

  DELETE FROM public.announcements
   WHERE deleted_at IS NOT NULL
     AND deleted_at < now() - make_interval(days => s.purge_archived_retention_days);
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_arch := v_arch + v_tmp;

  DELETE FROM public.activities a
   WHERE a.deleted_at IS NOT NULL
     AND a.deleted_at < now() - make_interval(days => s.purge_archived_retention_days)
     AND NOT EXISTS (SELECT 1 FROM public.activity_sessions x WHERE x.activity_id = a.id);
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_arch := v_arch + v_tmp;
  -- 註：帳號（志工/職員）即使封存也不硬刪（FK/歷史保護），僅維持隱藏。

  -- 已寄送/已讀且逾期的通知（pending 與 processing 一律保留）
  DELETE FROM public.notification_outbox
   WHERE status NOT IN ('pending', 'processing')
     AND created_at < now() - make_interval(days => s.purge_notification_retention_days);
  GET DIAGNOSTICS v_notif = ROW_COUNT;

  DELETE FROM public.audit_logs
   WHERE created_at < now() - make_interval(days => s.purge_audit_retention_days);
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  DELETE FROM public.registrations r
   WHERE r.status IN ('cancelled', 'expired', 'rejected')
     AND r.attendance IS NULL
     AND r.updated_at < now() - make_interval(days => s.purge_registration_retention_days)
     AND NOT EXISTS (SELECT 1 FROM public.blacklist_events b WHERE b.registration_id = r.id);
  GET DIAGNOSTICS v_reg = ROW_COUNT;

  RETURN jsonb_build_object(
    'archived', v_arch, 'notifications', v_notif,
    'audit_logs', v_audit, 'registrations', v_reg);
END $$;

-- ---------------------------------------------------------
-- 6. 權限：三支皆為 worker 專用，不開放前端（比照 05／23 的慣例）
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_claim_notifications(integer, text),
  public.rpc_complete_notification(uuid, text, text),
  public.job_requeue_stuck_notifications()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.rpc_claim_notifications(integer, text),
  public.rpc_complete_notification(uuid, text, text),
  public.job_requeue_stuck_notifications()
TO service_role;

NOTIFY pgrst, 'reload schema';
