// Server Action 的共用回傳形狀。
//
// 全站所有 action 都回這個形狀：失敗時只給 error、其餘欄位為 undefined；成功時
// success 為 true。呼叫端一律先檢查 error 再讀其他欄位，前端的 callAction()
// （lib/ui/toast-actions.ts）也是靠這條慣例把網路失敗轉成同型的結果。
//
// 過去這個介面在 9 個 action 檔各自定義一次，改動慣例得逐檔跟進；集中在此讓
// 「所有 action 回同一形狀」從口頭約定變成型別強制。需要額外欄位的用交集型別
// 擴充，例如 `ActionResult & { staffId?: string }`。
export interface ActionResult {
  error?: string;
  success?: boolean;
}
