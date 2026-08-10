// 前台共用的載入中轉圈（後台表格列用 admin/ui.tsx 的 LoadingRow）。
//
// translate="no" ＋ notranslate 不可省略：Material Symbols 靠字型 ligature 把
// "progress_activity" 這串文字畫成圖示，瀏覽器翻譯會把它換成譯文，圖示就變成
// 一行英文。只有開翻譯的使用者看得到，故一律經本檔渲染，不要另外手寫。

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

// 區塊／整頁的置中轉圈。className 給外層盒子：整頁替換時用 flex-1 撐滿剩餘
// 高度，嵌在內容區時用 py-20 留白，兩者可並用。
export function PageSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`.trim()}>
      <Spinner className="text-4xl text-primary" />
    </div>
  );
}
