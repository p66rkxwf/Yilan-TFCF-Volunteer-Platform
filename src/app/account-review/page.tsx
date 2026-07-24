// 帳號審核狀態頁：審核中／未通過的志工帳號被導到這裡，看不到平台資料。
// 其餘身分（在職志工、職員、未登入）一律導走。

import { redirect } from "next/navigation";
import { getCachedUser, getCachedIdentity } from "@/lib/supabase/cached-auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

export default async function AccountReviewPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const identity = await getCachedIdentity(user.id);
  if (!identity) redirect("/");
  if (identity.kind === "staff") redirect("/admin");
  if (identity.status !== "pending_review" && identity.status !== "rejected") {
    redirect("/volunteer");
  }

  const isRejected = identity.status === "rejected";

  // 顯示使用者自訂的「帳號」而非系統產生的內部登入信箱（UUID@users.sekinv.com）。
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("volunteer_profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  const accountLabel = (profile?.username as string | undefined) ?? "—";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className={`mb-5 flex h-14 w-14 items-center justify-center rounded-full ${
          isRejected ? "bg-amber-100 text-amber-600" : "bg-amber-100 text-amber-600"
        }`}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[28px]">
          {isRejected ? "cancel" : "hourglass_top"}
        </span>
      </div>

      <h1 className="text-xl font-bold text-slate-900">
        {isRejected ? "帳號審核未通過" : "帳號審核中"}
      </h1>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        {isRejected ? (
          <>
            您的志工帳號審核未通過，目前無法使用平台功能。
            <br />
            如有疑問，請聯絡宜蘭家扶中心承辦社工。
          </>
        ) : (
          <>
            您的志工帳號正在審核中，通過後即可瀏覽活動與報名。
            <br />
            審核結果將以 Email 通知，請耐心等候。
          </>
        )}
      </p>

      <form action={signOut} className="mt-6 w-full max-w-xs">
        <button
          type="submit"
          className="w-full rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          登出
        </button>
      </form>

      <p className="mt-6 text-xs text-slate-400">宜蘭家扶中心 · 帳號：{accountLabel}</p>
    </main>
  );
}
