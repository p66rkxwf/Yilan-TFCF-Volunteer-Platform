"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword, updateEmail, deleteAccount } from "@/lib/actions/auth";
import { setFlashToast, useToast } from "@/components/ui/toast";

function SettingsSection({
  icon,
  title,
  description,
  children,
  danger,
}: {
  icon: string;
  title: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`bg-white p-6 rounded-xl border ${
        danger ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3 mb-6">
        <span
          className={`material-symbols-outlined ${
            danger ? "text-red-500" : "text-primary"
          }`}
        >
          {icon}
        </span>
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();

  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  const [emailForm, setEmailForm] = useState({ email: "" });
  const [emailLoading, setEmailLoading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pwForm.password !== pwForm.confirm) {
      toast.error("兩次密碼輸入不一致。");
      return;
    }
    if (pwForm.password.length < 8) {
      toast.error("密碼至少需要 8 個字元。");
      return;
    }

    setPwLoading(true);
    const result = await updatePassword(pwForm.password);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("密碼已更新！");
      setPwForm({ password: "", confirm: "" });
    }
    setPwLoading(false);
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    setEmailLoading(true);
    const result = await updateEmail(emailForm.email);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("驗證信已寄出，請至新信箱確認。");
      setEmailForm({ email: "" });
    }
    setEmailLoading(false);
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);

    const result = await deleteAccount();
    if (result.error) {
      toast.error(result.error);
      setDeleteLoading(false);
    } else {
      setFlashToast({
        variant: "success",
        title: "帳號已停用",
        description: "您的帳號已停用並完成登出。",
      });
      router.push("/login");
      router.refresh();
    }
  };

  const inputCls =
    "w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white flex items-center px-6 md:px-8 shrink-0">
        <h1 className="text-lg font-bold">帳號設定</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Password */}
          <SettingsSection
            icon="lock"
            title="修改密碼"
            description="建議定期更換密碼以維護帳號安全。"
          >
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  新密碼
                </label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="至少 8 個字元"
                  value={pwForm.password}
                  onChange={(e) =>
                    setPwForm((p) => ({ ...p, password: e.target.value }))
                  }
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  確認新密碼
                </label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="再次輸入新密碼"
                  value={pwForm.confirm}
                  onChange={(e) =>
                    setPwForm((p) => ({ ...p, confirm: e.target.value }))
                  }
                  required
                  minLength={8}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {pwLoading && (
                    <span className="material-symbols-outlined animate-spin text-[16px]">
                      progress_activity
                    </span>
                  )}
                  更新密碼
                </button>
              </div>
            </form>
          </SettingsSection>

          {/* Email */}
          <SettingsSection
            icon="mail"
            title="修改 Email"
            description="更改後需至新信箱完成驗證。"
          >
            <form onSubmit={handleEmailUpdate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  新的 Email 地址
                </label>
                <input
                  type="email"
                  className={inputCls}
                  placeholder="new-email@example.com"
                  value={emailForm.email}
                  onChange={(e) =>
                    setEmailForm({ email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {emailLoading && (
                    <span className="material-symbols-outlined animate-spin text-[16px]">
                      progress_activity
                    </span>
                  )}
                  更新 Email
                </button>
              </div>
            </form>
          </SettingsSection>

          {/* Delete Account */}
          <SettingsSection
            icon="warning"
            title="刪除帳號"
            description="此操作會停用您的帳號，將無法再登入使用。"
            danger
          >
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium mb-3">
                  請在下方輸入「刪除我的帳號」確認此操作：
                </p>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-lg border border-red-200 bg-white focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition-all"
                  placeholder="刪除我的帳號"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading || deleteConfirm !== "刪除我的帳號"}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center gap-2"
                >
                  {deleteLoading && (
                    <span className="material-symbols-outlined animate-spin text-[16px]">
                      progress_activity
                    </span>
                  )}
                  確認刪除帳號
                </button>
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>
    </>
  );
}
