# 函式／視圖版本登記表

**改動任何既有函式前，先在下表查到它的 canonical 檔案，從那一檔複製。**

## 為什麼有這份表

本目錄的增量 patch 慣例是「複製整支函式、改其中幾行、`CREATE OR REPLACE`」。這個做法有一個安靜的失敗模式：**如果複製來源挑錯（挑到舊版而非最新版），中間版本新增的條件會整段消失，而 Postgres 不會有任何警告。**

實際發生過兩次：

- `34_fix_archived_volunteer_guards.sql` 為了補 `deleted_at IS NULL`，從 `04` 複製 `rpc_register_for_session`。但該函式在 `21` 已加過「未驗證 Email 不得報名」的關卡（`30`、`31` 也各改過一次）。34 是最後一版，於是那道 Email 關卡從正式庫消失。34 的檔頭甚至寫著「兩者自 04 以來未被其他檔覆蓋過（**已確認**）」——確認錯了。
- `31_briefing_registration.sql` 從 `02` 複製 `fn_fill_hours_on_attendance`，掉了 `16` 設的時數下限 `0.01`，讓極短場次觸發 `service_hours > 0` 的 CHECK。

兩者都由 `39_fix_function_regressions.sql` 修回。

## 規約

1. 要改一支既有函式 → 查下表的 **canonical** 欄，從那一檔複製。
2. 覆蓋鏈標了 ⚠️ 的物件已被覆蓋過至少一次，特別容易挑錯來源。
3. 新檔的檔頭請寫明「本體同 NN」，讓下一個人知道你的來源。
4. 改完執行 `node scripts/check-function-registry.mjs --write` 更新本表，並在 PR 一起送出。

CI 會跑 `node scripts/check-function-registry.mjs`：表格與 `supabase/v2/*.sql` 的實際狀況不符就失敗。

> 本表格由腳本產生，請勿手改表格內容（表格以外的說明文字可以改）。

<!-- BEGIN GENERATED TABLE -->

| 物件 | 種類 | 覆蓋鏈（依編號） | canonical |
| --- | --- | --- | --- |
| `fn_activity_delete_guard` | function | 02 → 26 ⚠️ | **26** |
| `fn_activity_transition_guard` | function | 02 | **02** |
| `fn_audit` | function | 02 → 24 ⚠️ | **24** |
| `fn_audit_activity_status` | function | 24 | **24** |
| `fn_audit_announcement` | function | 24 | **24** |
| `fn_audit_period` | function | 24 | **24** |
| `fn_audit_session` | function | 24 | **24** |
| `fn_audit_settings` | function | 24 | **24** |
| `fn_audit_volunteer_registration` | function | 24 | **24** |
| `fn_can_manage_activity` | function | 03 → 09 ⚠️ | **09** |
| `fn_cascade_cancel_future_registrations` | function | 04 → 18 → 32 ⚠️ | **32** |
| `fn_check_assigned_worker` | function | 02 → 36 ⚠️ | **36** |
| `fn_check_staff_volunteer_exclusive` | function | 02 | **02** |
| `fn_fill_hours_on_attendance` | function | 02 → 16 → 31 → 39 ⚠️ | **39** |
| `fn_is_active_volunteer` | function | 03 | **03** |
| `fn_is_admin` | function | 03 | **03** |
| `fn_is_staff` | function | 03 | **03** |
| `fn_is_system_admin` | function | 03 | **03** |
| `fn_makeup_release_blacklist` | function | 02 | **02** |
| `fn_must_change_password` | function | 20 | **20** |
| `fn_notify` | function | 02 | **02** |
| `fn_notify_new_account` | function | 27 | **27** |
| `fn_notify_new_registration` | function | 27 → 32 ⚠️ | **32** |
| `fn_registration_transition_guard` | function | 02 | **02** |
| `fn_session_time_changed` | function | 02 → 32 ⚠️ | **32** |
| `fn_session_validate` | function | 02 → 25 ⚠️ | **25** |
| `fn_set_updated_at` | function | 02 | **02** |
| `fn_staff_role` | function | 03 | **03** |
| `fn_staff_update_guard` | function | 02 → 20 → 22 ⚠️ | **22** |
| `fn_sync_auth_email` | function | 02 | **02** |
| `fn_sync_is_blacklisted` | function | 02 | **02** |
| `fn_volunteer_self_update_whitelist` | function | 02 → 20 → 21 → 22 ⚠️ | **22** |
| `job_advance_activity_status` | function | 05 → 25 ⚠️ | **25** |
| `job_attendance_scan` | function | 05 → 19 → 32 ⚠️ | **32** |
| `job_purge_expired` | function | 23 → 42 ⚠️ | **42** |
| `job_purge_rejected_accounts` | function | 35 | **35** |
| `job_release_blacklists` | function | 05 | **05** |
| `job_requeue_stuck_notifications` | function | 42 | **42** |
| `job_send_activity_reminders` | function | 05 → 32 ⚠️ | **32** |
| `job_send_review_reminders` | function | 05 → 32 ⚠️ | **32** |
| `rpc_adjust_blacklist` | function | 04 | **04** |
| `rpc_admin_check_in` | function | 04 | **04** |
| `rpc_admin_update_staff_profile` | function | 28 | **28** |
| `rpc_admin_update_volunteer_profile` | function | 22 → 28 ⚠️ | **28** |
| `rpc_archive_record` | function | 23 | **23** |
| `rpc_assign_volunteer` | function | 04 → 32 → 34 ⚠️ | **34** |
| `rpc_cancel_activity` | function | 04 → 18 → 32 ⚠️ | **32** |
| `rpc_cancel_session` | function | 04 → 18 → 32 ⚠️ | **32** |
| `rpc_claim_notifications` | function | 42 | **42** |
| `rpc_complete_notification` | function | 42 | **42** |
| `rpc_delete_notifications` | function | 38 | **38** |
| `rpc_delete_record` | function | 26 | **26** |
| `rpc_makeup_attendance` | function | 04 | **04** |
| `rpc_manual_blacklist` | function | 04 | **04** |
| `rpc_mark_notifications_read` | function | 15 | **15** |
| `rpc_organizer_contacts` | function | 37 | **37** |
| `rpc_purge_now` | function | 23 | **23** |
| `rpc_reassign_worker` | function | 17 → 36 ⚠️ | **36** |
| `rpc_register_for_session` | function | 04 → 21 → 30 → 31 → 34 → 39 ⚠️ | **39** |
| `rpc_request_cancel` | function | 04 → 11 ⚠️ | **11** |
| `rpc_request_deactivation` | function | 07 | **07** |
| `rpc_request_email_otp` | function | 21 → 37 → 40 ⚠️ | **40** |
| `rpc_resolve_support_request` | function | 10 | **10** |
| `rpc_restore_record` | function | 23 | **23** |
| `rpc_review_cancel` | function | 04 → 32 ⚠️ | **32** |
| `rpc_review_custom_service` | function | 27 | **27** |
| `rpc_review_deactivation_request` | function | 07 | **07** |
| `rpc_review_registration` | function | 04 → 32 ⚠️ | **32** |
| `rpc_review_volunteer_account` | function | 04 → 35 ⚠️ | **35** |
| `rpc_self_check_in` | function | 04 → 11 → 21 → 39 ⚠️ | **39** |
| `rpc_set_volunteer_worker` | function | 17 → 36 ⚠️ | **36** |
| `rpc_submit_custom_service` | function | 27 | **27** |
| `rpc_submit_support_request` | function | 10 → 25 → 37 ⚠️ | **37** |
| `rpc_update_own_staff_profile` | function | 28 | **28** |
| `rpc_update_own_volunteer_username` | function | 28 | **28** |
| `rpc_update_volunteer_grade` | function | 04 | **04** |
| `rpc_update_volunteer_status` | function | 04 | **04** |
| `rpc_verify_email_otp` | function | 21 | **21** |
| `rpc_withdraw_deactivation_request` | function | 07 | **07** |
| `v_activity_stats` | view | 03 | **03** |
| `v_annual_grade_review_list` | view | 03 | **03** |
| `v_my_notifications` | view | 40 | **40** |
| `v_organizer_contacts` | view | 03 → 23 ⚠️ | **23** |
| `v_overdue_cancel_reviews` | view | 03 | **03** |
| `v_session_open_slots` | view | 06 → 14 → 23 → 30 → 31 ⚠️ | **31** |
| `v_volunteer_hours` | view | 03 → 27 ⚠️ | **27** |
| `v_volunteer_period_hours` | view | 03 → 14 → 27 ⚠️ | **27** |

<!-- END GENERATED TABLE -->
