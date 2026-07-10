import type { Metadata } from "next";
import { InfoPageShell } from "@/components/shells/info-page-shell";
import { FaqContent } from "@/components/resource/faq-content";

export const metadata: Metadata = {
  title: "常見問題 | 宜蘭家扶中心",
  description: "查看宜蘭家扶中心的帳號、報名、收藏與通知常見問題。",
};

export default function ResourcePage() {
  return (
    <InfoPageShell
      title="常見問題"
      meta={
        <>
          <span>文件範圍：FAQ / 操作排查 / 快速入口</span>
          <span>更新日期：2026年3月11日</span>
        </>
      }
    >
      <FaqContent />
    </InfoPageShell>
  );
}
