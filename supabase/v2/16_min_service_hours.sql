-- =========================================================
-- 志工管理平台 16_min_service_hours.sql（正確性修補）
-- 內容：fn_fill_hours_on_attendance 自動帶入時數時設下限 0.01，
--       避免極短場次（時長 < 約 18 秒，round 後為 0.00）違反
--       registrations.service_hours 的 CHECK（> 0）導致簽到/代登失敗。
--       實務場次都是數小時，僅為極端輸入防呆。
-- 前置：01 → 02（原函式與 fill_hours trigger 已建立）。
-- 冪等：CREATE OR REPLACE 可重複執行；trigger 綁定不變。
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_fill_hours_on_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.attendance IN ('attended', 'makeup_attended') THEN
    IF NEW.service_hours IS NULL THEN
      SELECT GREATEST(round(EXTRACT(EPOCH FROM (end_at - start_at)) / 3600.0, 2), 0.01)
        INTO NEW.service_hours
        FROM public.activity_sessions WHERE id = NEW.activity_session_id;
    END IF;
  ELSE
    NEW.service_hours := NULL;  -- absent 或未記錄 → 無時數（與 CHECK 一致）
  END IF;
  RETURN NEW;
END $$;
