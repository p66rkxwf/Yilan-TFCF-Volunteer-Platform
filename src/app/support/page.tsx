import type { Metadata } from "next";
import { InfoPageShell } from "@/components/shells/info-page-shell";
import { SupportContent } from "@/components/support/support-content";

export const metadata: Metadata = {
  title: "聯絡支援 | 宜蘭家扶中心",
  description: "提交帳號、活動報名或資料異常等問題，聯絡宜蘭家扶中心支援團隊。",
};

export default function SupportPage() {
  return (
    <InfoPageShell
      title="聯絡支援"
      meta={
        <>
          <span>處理方式：由平台管理團隊依序處理</span>
          <span>建議附上：操作步驟與錯誤截圖</span>
        </>
      }
    >
      <SupportContent />
    </InfoPageShell>
  );
}
