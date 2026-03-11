import type { Metadata } from "next";
import Link from "next/link";
import { InfoPageShell } from "@/components/information/page-shell";

const TERMS_SECTIONS = [
  {
    id: "scope",
    index: "01",
    title: "服務適用範圍",
    paragraphs: [
      "本平台提供志工帳號註冊、活動瀏覽、報名、收藏與個人資料管理等功能，適用於宜蘭家扶基金會志工相關業務需求。",
      "當您建立帳號、登入或使用任何與活動參與相關的功能時，即表示您已閱讀、理解並同意遵守本服務條款與相關平台規範。",
    ],
  },
  {
    id: "account",
    index: "02",
    title: "帳號與資格",
    paragraphs: [
      "您應提供真實、完整且可供聯繫的基本資料，以利後續活動通知、審核與身分確認。若資料有誤，平台得要求補件或暫停部分功能。",
      "帳號僅限本人使用，不得轉借、販售或冒用他人身分註冊。若帳號有異常登入或未授權使用情形，請立即透過支援頁回報。",
    ],
  },
  {
    id: "registration",
    index: "03",
    title: "活動報名與取消",
    paragraphs: [
      "活動報名送出後，不代表已取得最終參與資格，仍可能依活動名額、審核流程與單位安排進行調整。",
      "若您已報名活動但無法出席，應於活動規定時限內取消或主動通知管理團隊，避免影響人力安排與後續報名權益。",
    ],
  },
  {
    id: "conduct",
    index: "04",
    title: "平台使用規範",
    paragraphs: [
      "使用者不得以任何方式干擾平台正常運作，包括但不限於惡意測試、未經授權存取、批次擷取資料、散布不實資訊或上傳違法內容。",
      "若平台發現使用者有違反規範、妨害活動秩序或損及其他志工與單位權益之行為，得限制、暫停或終止其帳號使用。",
    ],
  },
  {
    id: "content",
    index: "05",
    title: "內容與智慧財產",
    paragraphs: [
      "平台內之文字、介面、圖像、活動資料與系統設計，除另有標示外，均屬本平台或合法授權範圍，未經同意不得任意重製、轉載或商業使用。",
      "使用者自行填寫之資料與回報內容，應確保不侵害第三人權利；如涉及個人資料或敏感資訊，也應遵守本平台隱私政策。",
    ],
  },
  {
    id: "updates",
    index: "06",
    title: "責任限制與條款更新",
    paragraphs: [
      "平台將盡力維持資料正確與服務穩定，但仍可能因系統維護、網路中斷、第三方服務異常或不可抗力因素，導致功能暫時受影響。",
      "本條款如有調整，將以平台公告或更新文件內容為準；若您於更新後繼續使用本平台，視為接受調整後之內容。",
    ],
  },
] as const;

const RELATED_DOCUMENTS = [
  { label: "常見問題", href: "/resource", icon: "help" },
  { label: "隱私政策", href: "/privacy", icon: "shield_lock" },
  { label: "聯絡支援", href: "/support", icon: "support_agent" },
] as const;

export const metadata: Metadata = {
  title: "服務條款 | 宜蘭TFCF志工平台",
  description: "查看宜蘭家扶志工平台的使用條款、報名規範與帳號責任說明。",
};

export default function TermsPage() {
  return (
    <InfoPageShell
      icon="gavel"
      eyebrow="Terms of Service"
      title="服務條款"
      description="本條款說明您在使用宜蘭家扶志工平台時的帳號義務、活動參與規範，以及平台內容與服務範圍。"
      meta={
        <>
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-900/5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              最後更新
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              2026年3月11日
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-900/5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              適用功能
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              註冊、登入、報名、收藏
            </p>
          </div>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              文件導覽
            </p>
            <nav className="mt-4 flex flex-col gap-2">
              {TERMS_SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-primary/5 hover:text-primary"
                >
                  {section.index} {section.title}
                </a>
              ))}
            </nav>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              相關文件
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {RELATED_DOCUMENTS.map((document) => (
                <Link
                  key={document.href}
                  href={document.href}
                  className="flex items-center justify-between rounded-2xl bg-background-light px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">
                      {document.icon}
                    </span>
                    {document.label}
                  </span>
                  <span className="material-symbols-outlined text-[18px]">
                    arrow_forward
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          {TERMS_SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 md:p-8"
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-black text-primary">
                  {section.index}
                </span>
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 md:text-base">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}

          <section className="rounded-3xl bg-slate-900 p-8 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
              Need Clarification
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight">
              若條款內容影響您的報名或帳號使用
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 md:text-base">
              建議一併提供活動名稱、帳號資訊與問題情境，平台管理團隊可依實際狀況協助說明。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/support"
                className="inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90"
              >
                聯絡支援
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                查看隱私政策
              </Link>
            </div>
          </section>
        </div>
      </div>
    </InfoPageShell>
  );
}
