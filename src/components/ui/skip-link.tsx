// 無障礙：鍵盤/報讀器使用者可略過頁首導覽，直接跳至主要內容（WCAG 2.4.1 Bypass Blocks）。
// 平時以 sr-only 隱藏，取得焦點時才顯現於左上角。目標為 #main-content。

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      跳到主要內容
    </a>
  );
}
