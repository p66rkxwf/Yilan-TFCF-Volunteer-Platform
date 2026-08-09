// 前台共用的載入中轉圈。後台走 admin/ui.tsx 的 LoadingRow（表格列專用），前台
// 原本沒有對應物，於是同一段標記在 /profile 與 /volunteer 底下複製了十幾次。
//
// 抽成元件的主因不是省行數，而是 translate="no" ＋ notranslate 這兩個屬性：
// Material Symbols 靠字型 ligature 把 "progress_activity" 這串文字畫成圖示，
// 瀏覽器翻譯會把它換成譯文，圖示就變成一行英文（見 73ce0a2）。這是抄漏了也
// 不會壞、只有開翻譯的使用者才看得到的細節，正該由元件記住。

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      translate="no"
      aria-hidden="true"
      className={`material-symbols-outlined notranslate animate-spin ${className}`.trim()}
    >
      progress_activity
    </span>
  );
}

// 區塊／整頁的置中轉圈。className 收外層盒子的版面差異：整頁替換時給 flex-1
// 撐滿剩餘高度，嵌在內容區時給 py-20 留白，兩者可並用。
export function PageSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`.trim()}>
      <Spinner className="text-4xl text-primary" />
    </div>
  );
}
