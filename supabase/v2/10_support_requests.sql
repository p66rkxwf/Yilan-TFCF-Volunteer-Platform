-- =========================================================
-- 志工管理平台 10_support_requests.sql
-- 用途：/support 頁的支援表單改為真送出（原本僅前端假延遲，未落地）。
-- 前置：01 → 02 → 03 → 04（沿用 fn_is_staff() / fn_audit() / fn_set_updated_at()）
--
-- 設計原則：
-- - /support 頁未登入亦可瀏覽（middleware 未攔截），故送出 RPC 需同時開放
--   anon 與 authenticated；比照 03 的「registrations 無直寫 policy，一律走
--   RPC」慣例，即使需要 anon 寫入也不開 INSERT policy，改由 SECURITY DEFINER
--   RPC 控制欄位（status 一律 'open'、created_by 一律取 auth.uid()）。
-- - 讀取／標記處理僅在職職員（fn_is_staff()），比照後台其餘管理列表。
--
-- 執行方式：於 Supabase SQL Editor 貼上並執行本檔即可（可重複執行；
-- CREATE TYPE 部分若已存在會報錯，此時可略過該行重跑其餘部分）。
-- =========================================================

-- ---------------------------------------------------------
-- 1. ENUM 型別（全新型別，非既有 enum 加值，毋須分兩步驟）
-- ---------------------------------------------------------
CREATE TYPE support_request_status AS ENUM ('open', 'resolved');

-- ---------------------------------------------------------
-- 2. 資料表（support_requests）
-- ---------------------------------------------------------
CREATE TABLE public.support_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  topic text NOT NULL,
  message text NOT NULL,
  status support_request_status NOT NULL DEFAULT 'open',
  created_by uuid,                          -- 未登入送出為 NULL；有登入則記錄提出者
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_requests_pkey PRIMARY KEY (id),
  CONSTRAINT support_requests_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT support_requests_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES public.staff_profiles(id),
  -- 已處理 與 處理人/時間 一對一綁定（比照 07 的 deactivation_review_consistency）
  CONSTRAINT support_requests_resolved_consistency
    CHECK ((status = 'resolved') = (resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE INDEX support_requests_status_idx ON public.support_requests (status);
CREATE INDEX support_requests_created_at_idx ON public.support_requests (created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------
-- 3. RLS：唯讀，寫入全走 RPC（比照 registrations / deactivation_requests 慣例）
-- ---------------------------------------------------------
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_requests_select_staff ON public.support_requests
  FOR SELECT USING (public.fn_is_staff());

-- 刻意不開放送出者本人 SELECT：多數送出者為未登入訪客，本無 session 可比對；
-- 後台收件匣為唯一查看管道。

-- ---------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------

-- (a) 送出支援需求：anon／authenticated 皆可呼叫；欄位由函式內容控制，
--     呼叫者無法自行指定 status／created_by／resolved_*。
CREATE OR REPLACE FUNCTION public.rpc_submit_support_request(
  p_name text, p_email text, p_topic text, p_message text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_name text := trim(p_name);
  v_email text := trim(p_email);
  v_message text := trim(p_message);
  v_request_id uuid;
BEGIN
  IF v_name = '' OR v_email = '' OR v_message = '' THEN
    RAISE EXCEPTION '姓名、Email 與問題描述為必填欄位';
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Email 格式不正確';
  END IF;

  INSERT INTO public.support_requests (name, email, topic, message, created_by)
  VALUES (v_name, v_email, COALESCE(NULLIF(trim(p_topic), ''), '其他問題'), v_message, auth.uid())
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END $$;

-- (b) 職員標記已處理／重新開啟
CREATE OR REPLACE FUNCTION public.rpc_resolve_support_request(
  p_request_id uuid, p_resolved boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需在職職員權限'; END IF;

  UPDATE public.support_requests
  SET status = CASE WHEN p_resolved THEN 'resolved' ELSE 'open' END::support_request_status,
      resolved_by = CASE WHEN p_resolved THEN auth.uid() ELSE NULL END,
      resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END
  WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到此支援需求'; END IF;

  PERFORM public.fn_audit(
    CASE WHEN p_resolved THEN 'resolve_support_request' ELSE 'reopen_support_request' END,
    'support_requests', p_request_id, NULL);
END $$;

-- ---------------------------------------------------------
-- 5. 權限收斂：撤銷預設 EXECUTE，逐一授權
--    送出 RPC 需開放 anon（本系統唯一開放 anon 呼叫的 RPC，
--    因 /support 頁本身即未登入可用）；處理 RPC 僅 authenticated。
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_submit_support_request(text, text, text, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.rpc_submit_support_request(text, text, text, text)
TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.rpc_resolve_support_request(uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_resolve_support_request(uuid, boolean)
TO authenticated;
