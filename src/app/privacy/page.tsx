import type { Metadata } from "next";
import Link from "next/link";
import { InfoPageShell } from "@/components/shells/info-page-shell";

const PRIVACY_SECTIONS = [
  {
    id: "collection",
    index: "01",
    title: "我們收集哪些資訊",
    paragraphs: [
      "當您註冊帳號、編輯個人資料、報名活動或使用收藏功能時，平台可能收集姓名、Email、生日、區域、活動參與紀錄與帳號操作資訊。",
      "部分技術性資料會在您使用平台時自動產生，例如登入紀錄、裝置與瀏覽器資訊、存取時間，以及必要的系統除錯資訊。",
    ],
    bullets: [
      "您主動填寫的基本資料與聯絡方式",
      "活動報名、取消與收藏等操作紀錄",
      "維持平台安全所需的登入與裝置資訊",
    ],
  },
  {
    id: "usage",
    index: "02",
    title: "資訊使用目的",
    paragraphs: [
      "我們使用您的資料以完成帳號管理、活動報名審核、志工聯繫、公告通知與客服支援等必要流程。",
      "在不超出原始蒐集目的的前提下，平台也可能使用資料進行系統維護、流程優化、統計分析與安全監測。",
    ],
    bullets: [
      "提供註冊、登入與個人資料管理功能",
      "支援活動名額管理、審核與聯繫通知",
      "偵測異常操作並提升平台穩定性",
    ],
  },
  {
    id: "retention",
    index: "03",
    title: "資料保存與安全措施",
    paragraphs: [
      "個人資料將依平台營運需求、活動管理必要性與適用法令保存，不會在無正當理由下長期保留超出目的所需的資料。",
      "我們採取權限控管、登入保護、資料庫存取限制與必要的技術管理措施，以降低未授權存取、外洩或竄改風險。",
    ],
  },
  {
    id: "sharing",
    index: "04",
    title: "資料共享與揭露",
    paragraphs: [
      "除非取得您的同意、為完成活動管理流程所必要，或符合法律要求，平台不會任意將您的個人資料揭露給不相干的第三方。",
      "若需由授權合作夥伴協助處理平台服務，我們會在合理範圍內要求對方採取適當保護措施，並限制其使用目的。",
    ],
    bullets: [
      "為活動執行與聯繫所必要的內部使用",
      "依法律、主管機關或司法命令的揭露要求",
      "為維持平台安全與防止濫用所需的處理",
    ],
  },
  {
    id: "rights",
    index: "05",
    title: "您的資料權利",
    paragraphs: [
      "您可依適用規定申請查詢、閱覽、補充、更正或刪除與您相關的個人資料，並得要求停止特定資料處理。",
      "若您希望調整或刪除資料，建議先透過個人設定頁自行更新；如需進一步協助，可直接使用聯絡支援頁提出申請。",
    ],
    bullets: [
      "查詢與閱覽個人資料",
      "補充、更正或更新聯絡資訊",
      "申請停止蒐集、處理或刪除資料",
    ],
  },
  {
    id: "cookies",
    index: "06",
    title: "登入狀態與必要技術",
    paragraphs: [
      "平台可能使用維持登入狀態、身份驗證與安全控制所需的技術機制，以確保您能正常使用受保護的功能。",
      "若您停用瀏覽器中的必要儲存或安全機制，可能導致登入、報名或個人資料管理功能無法正常運作。",
    ],
  },
] as const;

const RELATED_LINKS = [
  { label: "服務條款", href: "/terms", icon: "gavel" },
  { label: "常見問題", href: "/resource", icon: "help" },
  { label: "聯絡支援", href: "/support", icon: "support_agent" },
] as const;

export const metadata: Metadata = {
  title: "隱私政策 | 宜蘭家扶中心",
  description: "了解宜蘭家扶中心如何蒐集、使用、保存與保護個人資料。",
};

export default function PrivacyPage() {
  return (
    <InfoPageShell
      title="隱私政策"
      meta={
        <>
          <span>最後更新：2026年3月11日</span>
          <span>適用資料：帳號、報名與操作紀錄</span>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            文件導覽
          </p>
          <nav className="mt-2 flex flex-col">
            {PRIVACY_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-primary/5 hover:text-primary"
              >
                {section.index} {section.title}
              </a>
            ))}
          </nav>

          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            相關頁面
          </p>
          <div className="mt-2 flex flex-col">
            {RELATED_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-primary/5 hover:text-primary"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>
        </aside>

        <div className="space-y-8">
          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h2 className="border-b border-slate-200 pb-2 text-base font-bold tracking-tight text-slate-900">
                {section.index} {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              {"bullets" in section ? (
                <ul className="mt-3 grid gap-2 md:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex gap-2 text-sm leading-6 text-slate-600"
                    >
                      <span className="mt-1 text-primary">+</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <section className="border-t border-slate-200 pt-6">
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              若您需要查詢或更正個人資料
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              建議先於個人設定頁面更新；若涉及刪除、停止處理或其他進一步申請，請透過支援頁聯繫平台管理團隊。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/support"
                className="inline-flex items-center rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                提交資料需求
              </Link>
              <Link
                href="/terms"
                className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                查看服務條款
              </Link>
            </div>
          </section>
        </div>
      </div>
    </InfoPageShell>
  );
}
