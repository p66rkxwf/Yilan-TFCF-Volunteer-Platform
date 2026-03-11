import type { Metadata } from "next";
import { InfoPageShell } from "@/components/shells/info-page-shell";
import { FaqContent } from "@/components/resource/faq-content";

export const metadata: Metadata = {
  title: "常見問題 | 宜蘭TFCF志工平台",
  description: "查看宜蘭家扶中心志工平台的帳號、報名、收藏與通知常見問題。",
};

export default function ResourcePage() {
  return (
    <InfoPageShell
      icon="help"
      eyebrow="Help Center"
      title="常見問題"
      description="整理志工平台最常見的操作與使用疑問，包含帳號註冊、活動報名、收藏功能與資料維護。"
      meta={
        <>
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-900/5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              文件範圍
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              FAQ / 操作排查 / 快速入口
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-900/5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              更新日期
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              2026年3月11日
            </p>
          </div>
        </>
      }
    >
      <FaqContent />
    </InfoPageShell>
  );
}
