// Server Action 的共用回傳形狀，全站唯一定義，各 action 檔不得自行宣告。
//
// 失敗時只給 error、其餘欄位為 undefined；成功時 success 為 true。呼叫端一律
// 先檢查 error 再讀其他欄位，前端的 callAction()（lib/ui/toast-actions.ts）
// 就是靠這條慣例把網路失敗轉成同型的結果。
//
// 需要額外欄位時用交集型別擴充，例如 `ActionResult & { staffId?: string }`。
export interface ActionResult {
  error?: string;
  success?: boolean;
}
