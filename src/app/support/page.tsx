import type { Metadata } from "next";
import { InfoPageShell } from "@/components/shells/info-page-shell";
import { SupportContent } from "@/components/support/support-content";

export const metadata: Metadata = {
  title: "聯絡支援 | 宜蘭家扶中心志工平台",
  description: "提交帳號、活動報名或資料異常等問題，聯絡宜蘭家扶中心志工平台支援團隊。",
};

export default function SupportPage() {
  return (
    <InfoPageShell
      icon="support_agent"
      eyebrow="Contact Support"
      title="聯絡支援"
      description="若您在註冊、登入、活動報名或個人資料更新時遇到問題，可透過此頁整理資訊後提交支援需求。"
      meta={
        <>
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-900/5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              處理時程
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              1 至 2 個工作天
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-900/5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              建議附上
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              操作步驟與錯誤截圖
            </p>
          </div>
        </>
      }
    >
      <SupportContent />
    </InfoPageShell>
  );
}
