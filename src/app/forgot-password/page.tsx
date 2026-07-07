import Link from "next/link";

// 本平台以「帳號」登入，聯絡 Email 可重複，故不提供以 Email 自助重設密碼；
// 密碼重設改由後台管理員協助（選 A：帳號登入＋管理員代重設）。
export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 justify-center py-12 px-6">
      <div className="flex max-w-[480px] flex-1 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-900">
            忘記密碼？
          </h1>
          <p className="text-base leading-relaxed text-slate-600">
            本平台以「帳號」登入，密碼重設由平台管理團隊協助處理。請聯絡宜蘭家扶中心
            平台管理團隊，並提供你的帳號與姓名以核對身分，我們會協助你重設密碼。
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-3xl">support_agent</span>
          </div>
          <p className="max-w-[320px] text-center text-sm leading-relaxed text-slate-600">
            透過「支援」頁面留下你的帳號與問題，或依平台公告的聯絡方式與管理團隊聯繫。
          </p>
          <Link
            href="/support"
            className="flex h-10 w-full max-w-[240px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90"
          >
            前往支援頁面
          </Link>
        </div>

        <div className="flex items-center justify-center">
          <Link
            href="/login"
            className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            返回登入
          </Link>
        </div>
      </div>
    </main>
  );
}
