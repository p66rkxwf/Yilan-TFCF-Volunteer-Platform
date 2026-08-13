-- =========================================================
-- 志工管理平台 40_otp_leak_fix.sql（資安：Email OTP 明碼不得經站內通知外洩）
--
-- 問題：21 產生 6 碼 OTP 後，除了寫進 email_verifications（該表已 REVOKE ALL、
--   無任何 policy，志工讀不到），還把明碼一併塞進 outbox 供 worker 寄信：
--       PERFORM fn_notify(v_uid, 'email_verification', jsonb_build_object('code', v_code));
--   但 15 把同一張 notification_outbox 兼作站內通知中心，並開放
--       GRANT SELECT ON public.notification_outbox TO authenticated;
--   加上 policy「recipient_user_id = auth.uid()」——而 OTP 那一列的收件者
--   正是志工本人。結果：登入者可直接讀自己的 payload 取得驗證碼，
--   完全不必進 Email 信箱。Email 持有權證明因此失效。
--   （前端刻意不顯示 OTP，但「前端不顯示」不等於「資料讀不到」。）
--
-- 修補（兩道，互相獨立）：
--   1. 明碼不再進 outbox。payload 留空，worker 改以 service_role 直接查
--      email_verifications 取碼（見 workers/orchestrator/src/index.ts）。
--      → 從源頭消除這份副本。歷史列一併清洗。
--   2. 站內通知的讀取面由「整張基表 SELECT」收斂成 v_my_notifications 視圖：
--      只外露渲染通知所需的欄位，並整型別排除 email_verification。
--      → 就算日後有人再往 payload 塞敏感資料，也不會直接外露。
--
--   基表的 GRANT SELECT 撤銷另置於 41（必須等前端改查視圖後才能執行）。
--
-- 前置：01 → 15 → 21 → 37（rpc_request_email_otp 現行版）→ 38（deleted_at）。
-- 冪等：可重複執行。
-- 注意：本檔須「後於」新版 mail worker 部署 —— 舊 worker 從 payload 讀碼，
--   若先跑本檔，佇列中未寄出的 OTP 信會寄出空白驗證碼。
--   新版 worker 一律查表、不看 payload，故先部署 worker 一定安全。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 產碼 RPC：不再把明碼寫進 outbox payload
--    本體同 37（CSPRNG 產碼、5 次上限、15 分鐘過期、60 秒節流），僅改 fn_notify 那一行。
--    簽章未變 → 保留 21 既有的 REVOKE/GRANT。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_request_email_otp()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_last timestamptz;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  SELECT email, email_verified_at INTO v_email, v_verified
  FROM public.volunteer_profiles WHERE id = v_uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION '僅在職志工可進行 Email 驗證'; END IF;
  IF v_verified IS NOT NULL THEN RAISE EXCEPTION '您的 Email 已完成驗證'; END IF;

  -- 頻率限制：同一使用者 60 秒內不得重複索取
  SELECT created_at INTO v_last FROM public.email_verifications WHERE volunteer_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '60 seconds' THEN
    RAISE EXCEPTION '驗證碼剛寄出，請稍候再重新索取';
  END IF;

  v_code := lpad(
    ((('x' || replace(gen_random_uuid()::text, '-', ''))::bit(32)::bigint) % 1000000)::text,
    6, '0');

  INSERT INTO public.email_verifications
    (volunteer_id, code, expires_at, attempts, consumed_at, created_at, updated_at)
  VALUES (v_uid, v_code, now() + interval '15 minutes', 0, NULL, now(), now())
  ON CONFLICT (volunteer_id) DO UPDATE
    SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at,
        attempts = 0, consumed_at = NULL, created_at = now(), updated_at = now();

  -- outbox 僅作為「請寄一封驗證信給此人」的信號，明碼不進 payload。
  -- worker 以 service_role 讀 email_verifications 取當下有效的碼（見檔頭）。
  PERFORM public.fn_notify(v_uid, 'email_verification', '{}'::jsonb);
END $$;

-- ---------------------------------------------------------
-- 2. 清洗歷史外洩：既有列的 payload 移除 code 鍵
--    已寄出的列留著只是稽核紀錄，碼本身早已過期或用掉；未寄出的列由新版
--    worker 查表取碼，不需要 payload 裡的值。
-- ---------------------------------------------------------
UPDATE public.notification_outbox
   SET payload = payload - 'code'
 WHERE notification_type = 'email_verification'
   AND payload ? 'code';

-- ---------------------------------------------------------
-- 3. 站內通知讀取面：收斂為視圖
--    security_invoker = off（比照 v_organizer_contacts）：以擁有者權限執行、
--    繞過基表 RLS，過濾條件寫在視圖內。此處必須用 off 而非 on——41 撤銷了
--    authenticated 對基表的 SELECT，invoker view 會因缺表層權限而失敗。
--    auth.uid() 讀的是 PostgREST 每請求設定的 GUC，與執行者角色無關，
--    故在 owner 權限下仍正確回傳呼叫者本人。
--
--    security_barrier = true：本視圖的存在目的就是「擋住 payload 外流」，
--    加上屏障可避免使用者自訂述詞被推到過濾條件之前而洩漏他人資料列。
--
--    刻意不外露 recipient_user_id / status / error / dedup_key / sent_at ——
--    那些是寄信佇列的欄位，站內通知渲染用不到。
--    email_verification 整型別排除：驗證信本來就只該在信箱裡看到。
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW public.v_my_notifications
WITH (security_invoker = off, security_barrier = true) AS
SELECT
  n.id,
  n.notification_type,
  n.payload,
  n.read_at,
  n.created_at
FROM public.notification_outbox n
WHERE n.recipient_user_id = auth.uid()
  AND n.deleted_at IS NULL
  AND n.notification_type <> 'email_verification';

REVOKE ALL ON public.v_my_notifications FROM anon;
GRANT SELECT ON public.v_my_notifications TO authenticated;

-- 讓 PostgREST 立即看見新視圖/授權。
NOTIFY pgrst, 'reload schema';
