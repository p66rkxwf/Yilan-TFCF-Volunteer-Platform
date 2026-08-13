-- =========================================================
-- 志工管理平台 41_notification_read_lockdown.sql（資安：關掉通知基表的直讀）
--
-- 用途：40 已建立 v_my_notifications 作為站內通知唯一讀取來源；本檔撤銷
--   15_notification_center.sql 給 authenticated 的基表 SELECT 權。
--   撤銷後，notification_outbox 回到「僅 service_role 與 SECURITY DEFINER RPC
--   可存取」，與 03_rls_policies.sql 原本的設計一致。
--
-- 為何單獨成檔：本檔是唯一具破壞性的一步——一旦執行，尚未更新的前端會讀不到
--   通知（鈴鐺與通知頁空白）。故與 40 分開，讓部署順序可控。
--
-- 【執行順序】必須「後於」前端部署：
--     40（建視圖）→ 部署 mail worker → 部署前端（改查視圖）→ 41（本檔）
--   比照 30／37／38 的順序註記慣例。
--
-- 前置：15（原 GRANT）→ 40（v_my_notifications 已建立且前端已改查）。
-- 冪等：REVOKE 可重複執行。
--
-- 保留不動：
--   - notification_select_own policy（38 的版本）留著。policy 只在有表層權限時
--     才起作用，權限撤掉後它是無害的殘留；留著可讓日後若需重新開放時有跡可循。
--   - rpc_mark_notifications_read（15）／rpc_delete_notifications（38）不受影響：
--     兩者皆 SECURITY DEFINER，以擁有者身分寫入基表，不依賴呼叫者的表層權限。
--   - v_my_notifications 亦不受影響：security_invoker = off，以擁有者權限讀基表。
-- =========================================================

REVOKE SELECT ON public.notification_outbox FROM authenticated;

-- 讓 PostgREST 立即看見授權變更。
NOTIFY pgrst, 'reload schema';
