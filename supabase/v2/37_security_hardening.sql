-- =========================================================
-- 志工管理平台 37_security_hardening.sql（資安審查加固 S2／S3／S4）
-- 2026-08 全專案資安檢核的三項加固。皆非可利用的漏洞，屬縱深防禦：
--   (S2) 支援表單：既有的頻率限制以 Email 為 key，換一個 Email 即可繞過。
--        補一道「全域每小時上限」作為斷路器。
--   (S3) Email OTP：改用密碼學等級的亂數來源（原為 random()）。
--   (S4) v_organizer_contacts：任何登入者可一次撈出「所有」活動的負責人
--        姓名＋電話。資訊本身屬刻意公開（負責人電話會顯示於前台活動頁），
--        但視圖沒有限縮範圍，等於開放批次抓取。改為逐活動查詢的 RPC。
--
-- 前置：01 → 03 → 10 → 21 → 23 → 25。
-- 冪等：CREATE OR REPLACE／REVOKE 皆可重複執行。
-- 注意：S4 會撤銷 authenticated 對視圖的 SELECT，**必須先於前端部署**，
--       否則前端仍在查視圖會直接壞掉（前端改為呼叫本檔新增的 RPC）。
-- =========================================================

-- ---------------------------------------------------------
-- (S2) 支援表單：加一道全域每小時上限
--      本體同 25_hardening_misc.sql，僅多一段檢查。
--
--      為何是「全域」而非 per-IP：plpgsql 看不到來源 IP（PostgREST 不傳），
--      而 per-Email 已證實可繞過。全域上限換 Email 無效。
--
--      取捨（已確認接受）：被惡意灌爆時，正常使用者當小時內也會送不出。
--      故門檻取 200——遠高於本單位的真實用量，只在明顯攻擊時才觸發；
--      且 /support 頁另列有電話與 Email 的替代聯絡管道。
--      真正的第一道防線是 Turnstile（前端 widget ＋ 伺服器端 siteverify）。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_submit_support_request(
  p_name text, p_email text, p_topic text, p_message text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_name text := trim(p_name);
  v_email text := trim(p_email);
  v_message text := trim(p_message);
  v_recent integer;
  v_total integer;
  v_request_id uuid;
BEGIN
  IF v_name = '' OR v_email = '' OR v_message = '' THEN
    RAISE EXCEPTION '姓名、Email 與問題描述為必填欄位';
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Email 格式不正確';
  END IF;
  -- 長度上限（防灌爆與超長內容）
  IF length(v_name) > 100 OR length(v_email) > 200
     OR length(v_message) > 2000 OR length(coalesce(trim(p_topic), '')) > 100 THEN
    RAISE EXCEPTION '欄位長度超過限制（姓名≤100、Email≤200、主題≤100、內容≤2000 字）';
  END IF;

  -- 頻率限制 (1)：同一 Email 一小時內至多 5 筆
  SELECT count(*) INTO v_recent FROM public.support_requests
   WHERE email = v_email AND created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION '送出過於頻繁，請稍後再試';
  END IF;

  -- 頻率限制 (2)：全域一小時內至多 200 筆（斷路器，換 Email 無法繞過）
  SELECT count(*) INTO v_total FROM public.support_requests
   WHERE created_at > now() - interval '1 hour';
  IF v_total >= 200 THEN
    RAISE EXCEPTION '系統目前收到大量請求，請稍後再試，或直接以電話聯繫宜蘭家扶中心';
  END IF;

  INSERT INTO public.support_requests (name, email, topic, message, created_by)
  VALUES (v_name, v_email, COALESCE(NULLIF(trim(p_topic), ''), '其他問題'), v_message, auth.uid())
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END $$;

-- ---------------------------------------------------------
-- (S3) Email OTP：改用密碼學等級亂數
--      原本用 random()（每連線一顆種子的 PRNG，理論上可預測）。
--
--      刻意不用 gen_random_bytes()：那支屬 pgcrypto，Supabase 安裝在
--      extensions schema，而本專案所有函式都 SET search_path = public, pg_temp，
--      會解析不到（得寫成 extensions.gen_random_bytes，增加環境相依）。
--      gen_random_uuid() 為 PG13+ 核心函式、v4 有 122 個隨機位元，取前 32 bit
--      對 10^6 取模的偏差可忽略（2^32 / 10^6 ≈ 4295 個完整區間）。
--
--      其餘防護維持不變：5 次嘗試上限、15 分鐘過期、60 秒重寄節流。
--      本體同 21_email_verification.sql，僅改產碼那一行。
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

  -- 走 outbox：worker 依 recipient 的聯絡 email 寄送（payload 帶明碼供寄信，
  -- 該碼 15 分鐘後失效且單次使用）。
  PERFORM public.fn_notify(v_uid, 'email_verification', jsonb_build_object('code', v_code));
END $$;

-- ---------------------------------------------------------
-- (S4) 負責人聯絡方式：由「整張視圖開放」改為「逐活動查詢的 RPC」
--
--      過濾條件與 23_soft_delete_and_purge.sql 的 v_organizer_contacts 完全一致
--      （非草稿、活動未封存、職員在職且未封存），只是多了 activity_id 參數，
--      呼叫端無法一次撈全部。
--
--      視圖本身保留不動：後台與既有 SQL 仍可能參照，且職員本來就讀得到
--      staff_profiles，對職員而言不是新的揭露面。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_organizer_contacts(p_activity_id uuid)
RETURNS TABLE (full_name text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT sp.full_name, sp.phone
  FROM public.activity_organizers ao
  JOIN public.staff_profiles sp ON sp.id = ao.staff_id
  JOIN public.activities a ON a.id = ao.activity_id
  WHERE ao.activity_id = p_activity_id
    AND a.status <> 'draft' AND a.deleted_at IS NULL
    AND sp.status = 'active' AND sp.deleted_at IS NULL
  ORDER BY sp.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_organizer_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_organizer_contacts(uuid) TO authenticated;

-- 收回視圖的批次撈取權（職員走後台既有查詢，不經此視圖）
REVOKE SELECT ON public.v_organizer_contacts FROM authenticated;

NOTIFY pgrst, 'reload schema';
