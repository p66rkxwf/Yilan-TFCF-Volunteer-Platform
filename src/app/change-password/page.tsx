"use client";

// 首次登入強制改密碼頁。批量建立／管理員建立／管理員重置密碼（密碼＝帳號）後，
// middleware 會把使用者一律導到本頁，改完密碼（清除 must_change_password 旗標）
// 才能使用平台其他功能。一般使用者要改密碼走「帳號設定」頁，本頁專供強制情境。

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/ui/toast";
import { updatePassword, signOut } from "@/lib/actions/auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/change-password");
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) return void toast.error("請輸入新密碼並再次確認。");
    if (password !== confirm) return void toast.error("兩次密碼輸入不一致。");
    if (password.length < 8) return void toast.error("密碼至少需要 8 個字元。");

    setIsSaving(true);
    const result = await updatePassword(password);
    setIsSaving(false);
    if (result.error) return void toast.error(result.error);

    toast.success("密碼已更新，歡迎使用。");
    // 旗標已清除；回首頁並刷新讓 middleware 重新評估、放行其他頁面。
    router.replace("/");
    router.refresh();
  };

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[440px] flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-slate-900 text-3xl font-black tracking-tight">請先設定新密碼</h1>
          <p className="text-slate-600 text-sm">
            您的帳號目前使用預設的初始密碼（＝您的帳號）。為了帳號安全，請設定一組
            新密碼後才能繼續使用平台。
          </p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-slate-700 text-sm font-semibold" htmlFor="new-password">
              新密碼
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="w-full h-12 px-4 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              placeholder="至少 8 個字元"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-slate-700 text-sm font-semibold" htmlFor="confirm-password">
              確認新密碼
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="w-full h-12 px-4 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              placeholder="再次輸入新密碼"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all disabled:opacity-60"
          >
            {isSaving ? "更新中…" : "設定新密碼並繼續"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => signOut()}
          className="text-center text-sm text-slate-500 hover:text-slate-700"
        >
          先登出
        </button>
      </div>
    </main>
  );
}
