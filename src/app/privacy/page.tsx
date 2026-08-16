import type { Metadata } from "next";
import Link from "next/link";
import { InfoPageShell } from "@/components/shells/info-page-shell";

// =========================================================================
// 隱私政策
//
// 2026-08-14 改寫。原版是通用樣板：寫「依平台營運需求保存」但系統裡其實有精確
// 的保留天數；未指名任何委外處理者，因此也沒揭露跨境傳輸；沒有資料控管者身分。
// 技術上早就做到了政策沒寫的事，這是最可惜的一種法遵缺口。
//
// 【本檔的寫作規約】本頁的每一項陳述都必須對應到程式碼中可驗證的事實：
//   - 欄位清單      → supabase/v2/01_schema.sql（volunteer_profiles 等）
//   - 保留天數      → supabase/v2/23_soft_delete_and_purge.sql 的四個 *_retention_days 預設值
//   - 保護措施      → 03_rls_policies.sql（20 張表全開 RLS）、src/lib/turnstile.ts、37_security_hardening.sql
//   - 自助修改範圍  → 22_lock_name_admin_edit.sql（姓名鎖定，白名單只留 phone/region）
//   - 未使用追蹤    → 全 repo 無任何 analytics／廣告 SDK
// 改動系統行為時（尤其是保留天數與委外服務），**必須同步改本頁**。
//
// 【上線前仍需由機構確認並補上的資訊】——這些我無法從程式碼得知：
//   1. 資料控管者的正式法人名稱與地址（本頁目前沿用全站慣用的「宜蘭家扶中心」）
//   2. 個資保護的專責聯絡窗口（本頁目前一律導向 /support，該頁會實際寫入後台收件匣）
//   3. Supabase／Cloudflare／Resend 的實際資料中心區域（本頁目前只寫「我國境外」，
//      若能確認具體區域，於第 06 節補上更佳）
//   4. 未成年志工的法定代理人同意，目前**系統端沒有任何蒐集或留存機制**（見第 09 節）。
//      這需要另以紙本或既有服務流程補足，或在註冊流程加上同意欄位並留存紀錄。
// =========================================================================

const PRIVACY_SECTIONS = [
  {
    id: "scope",
    index: "01",
    title: "適用範圍與資料控管者",
    paragraphs: [
      "本政策適用於宜蘭家扶中心志工平台（本平台）所蒐集、處理與利用的個人資料。資料控管者為宜蘭家扶中心；本平台為其為辦理志工招募、活動報名與服務時數管理所建置與維運的系統。",
      "本政策不適用於自本平台連出的外部網站，亦不適用於中心在本平台以外（例如紙本表單、電話或現場活動）另行進行的資料蒐集。",
    ],
  },
  {
    id: "collection",
    index: "02",
    title: "我們蒐集哪些個人資料",
    paragraphs: [
      "本平台蒐集的資料分為三類：您主動填寫的、因使用服務而產生的，以及為維持系統安全所必要的。以下為完整清單，本平台不蒐集清單以外的個人資料。",
      "註冊時的必填欄位為姓名、生日、聯絡 Email、登入帳號、聯絡電話與就學年級；所在地區為選填。若不提供必填欄位，將無法完成註冊與後續的活動報名。",
    ],
    bullets: [
      "帳號基本資料：姓名、生日、聯絡 Email、登入帳號、聯絡電話、所在地區、就學年級",
      "帳號狀態資料：審核狀態、負責社工、最後登入時間、帳號建立與更新時間",
      "活動參與紀錄：報名、審核結果、簽到與出席、服務時數、取消申請與審核結果",
      "其他使用紀錄：收藏的活動、自訂服務登錄與審核結果、帳號停用申請",
      "聯繫與通知紀錄：站內通知、寄送狀態，以及您透過支援頁提交的姓名、Email 與問題內容",
      "安全與稽核紀錄：Email 驗證碼（僅短期有效）、系統操作稽核軌跡、未依約出席所產生的紀錄",
    ],
  },
  {
    id: "purpose",
    index: "03",
    title: "蒐集與利用目的",
    paragraphs: [
      "本平台蒐集個人資料的特定目的，限於辦理志工業務所必要的範圍，包括帳號管理與身分確認、活動報名與資格審核、出席與服務時數的認證、志工聯繫與通知寄送、支援服務的回覆，以及維持平台安全與防止濫用。",
      "本平台不會將您的個人資料用於行銷、廣告或與上述目的無關的用途，亦不會出售或出租個人資料。統計與報表用途僅使用彙總後的數據。",
    ],
    bullets: [
      "帳號管理、身分確認與登入保護",
      "活動報名審核、名額管理與行前聯繫",
      "簽到、出席判定與服務時數的認證與證明",
      "站內通知與必要的電子郵件寄送",
      "支援需求的受理與回覆",
      "異常行為偵測、防濫用與系統稽核",
    ],
  },
  {
    id: "use",
    index: "04",
    title: "利用的期間、地區、對象與方式",
    paragraphs: [
      "期間：自您註冊之日起，至您的帳號被刪除或依第 05 節的保存期限屆滿並完成清除為止，或至相關法令規定的保存期間屆滿為止。",
      "地區：本平台使用的雲端服務（見第 06 節）其伺服器位於我國境外，因此您的個人資料會被傳輸並儲存於境外。",
      "對象：僅限中心內經授權的職員，且依角色分級限縮可見範圍；以及第 06 節所列、為提供本平台服務所必要的委外服務商。除法令要求或司法機關依法調取外，不提供予其他第三人。",
      "方式：以電子檔案形式儲存於資料庫，並透過本平台的網頁介面、通知信與後台管理功能進行處理與利用。",
    ],
    bullets: [
      "志工僅能看到自己的資料，以及活動負責人的姓名與聯絡電話",
      "一般職員可查看志工名冊與活動營運所需資料",
      "系統操作稽核軌跡僅限系統管理員查閱",
      "職員對個人資料的存取與修改均留有稽核紀錄",
    ],
  },
  {
    id: "retention",
    index: "05",
    title: "資料保存期限與自動清除",
    paragraphs: [
      "本平台設有自動清除排程，逾期資料會被永久刪除而非僅隱藏。目前的保存期限設定如下，中心得依業務與法令需要調整，調整後將更新本頁。",
      "服務時數是本平台的核心產出，攸關您的權益，因此已完成出席並產生服務時數的報名紀錄不列入自動清除範圍，會持續保存以確保您日後仍可申請服務證明。",
    ],
    bullets: [
      "已封存的活動與公告：封存後 30 天永久刪除",
      "站內通知與寄送紀錄：建立後 90 天永久刪除",
      "系統操作稽核軌跡：建立後 365 天永久刪除",
      "已結案且無出席紀錄的報名：最後異動後 365 天永久刪除",
      "已出席並產生服務時數的報名紀錄：持續保存，不自動清除",
      "Email 驗證碼：短期有效，逾期即失效",
    ],
  },
  {
    id: "processors",
    index: "06",
    title: "委外處理與跨境傳輸",
    paragraphs: [
      "為提供本平台服務，中心委由下列服務商處理必要的資料。這些服務商僅得依中心的指示、於提供服務所必要的範圍內處理個人資料，不得為自身目的使用。上述服務商的伺服器均位於我國境外，故本平台涉及個人資料的跨境傳輸。",
      "本平台未使用任何廣告聯播網、行銷追蹤或第三方網站分析服務。",
    ],
    bullets: [
      "Supabase：資料庫與帳號驗證服務，儲存本政策第 02 節所列的全部資料",
      "Cloudflare：網站主機、網域解析、人機驗證與防濫用防護；於連線過程產生必要的技術性連線紀錄",
      "Resend：通知信與驗證信的寄送，處理收件人 Email 與信件內容",
    ],
  },
  {
    id: "security",
    index: "07",
    title: "我們採取的保護措施",
    paragraphs: [
      "本平台在資料庫層即施加存取控制，而非僅在畫面上隱藏：所有資料表皆啟用資料列層級的權限控管，使用者即使繞過網頁介面直接呼叫介面，也只能取得其權限範圍內的資料。",
      "密碼以雜湊形式儲存，本平台不保存明文密碼，任何人（包含系統管理員）都無法查看您的密碼。管理員代為重設密碼時，系統產生的臨時密碼僅顯示一次且不留存，您下次登入時將被要求立即變更。",
    ],
    bullets: [
      "全站以 HTTPS 加密傳輸",
      "資料庫層的資料列層級權限控管，涵蓋全部資料表",
      "四級角色權限，職員僅取得執行職務所必要的最小權限",
      "職員對個人資料的存取與異動留存稽核軌跡",
      "登入與表單提交設有人機驗證與頻率限制，防止暴力破解與濫用",
      "聯絡 Email 需完成驗證，變更後須重新驗證",
    ],
  },
  {
    id: "rights",
    index: "08",
    title: "您的權利與行使方式",
    paragraphs: [
      "依個人資料保護法，您就本平台保有的個人資料，得行使查詢或請求閱覽、請求製給複製本、請求補充或更正、請求停止蒐集處理或利用，以及請求刪除等權利。",
      "部分資料可自行維護：您可於個人設定頁自行更新聯絡電話與所在地區。姓名因涉及服務時數證明的正確性，改由中心承辦人員維護，需透過支援頁提出申請。其餘權利的行使，亦請透過支援頁提出，中心將於核對身分後處理並回覆。",
      "請注意，若您請求刪除帳號或停止處理，將同時無法繼續使用報名、簽到與服務時數證明等功能；已產生的服務時數紀錄一經刪除即無法回復。",
    ],
    bullets: [
      "自行維護：聯絡電話、所在地區（個人設定頁）",
      "須經申請：姓名更正、生日更正、帳號刪除",
      "資料查詢與複製本：透過支援頁提出",
      "停止處理或利用：透過支援頁提出",
    ],
  },
  {
    id: "minors",
    index: "09",
    title: "未成年人與法定代理人",
    paragraphs: [
      "本平台的使用者包含未成年人。未滿十八歲者於註冊及使用本平台前，應取得法定代理人的同意；法定代理人得隨時就受監護人的個人資料行使第 08 節所列的各項權利。",
      "若法定代理人希望查詢、更正或刪除受監護人的個人資料，或希望撤回同意，請透過支援頁與中心聯繫，中心將於核對身分關係後處理。",
    ],
  },
  {
    id: "cookies",
    index: "10",
    title: "Cookie 與登入狀態",
    paragraphs: [
      "本平台僅使用維持登入狀態與資訊安全所必要的 Cookie，包括保存登入工作階段的驗證 Cookie，以及人機驗證機制運作所需的技術性 Cookie。這些 Cookie 是平台運作的必要條件，無法選擇關閉。",
      "本平台未使用廣告 Cookie、跨站追蹤或第三方分析工具。若您於瀏覽器停用必要的 Cookie 或儲存機制，將無法登入或使用報名等需要身分驗證的功能。",
    ],
  },
  {
    id: "changes",
    index: "11",
    title: "政策修訂",
    paragraphs: [
      "本政策將隨平台功能與法令要求調整。修訂後將更新本頁的最後更新日期；涉及蒐集目的、資料類別或保存期限的重大變更，中心將另以站內通知或電子郵件告知。",
      "若您對本政策或個人資料的處理方式有任何疑問，請透過支援頁與中心聯繫。",
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
  description:
    "宜蘭家扶中心志工平台蒐集哪些個人資料、用於什麼目的、保存多久、委由哪些服務商處理，以及您可以如何行使權利。",
};

export default function PrivacyPage() {
  return (
    <InfoPageShell
      title="隱私政策"
      meta={
        <>
          <span>最後更新：2026年8月14日</span>
          <span>適用資料：帳號、報名、通知與操作紀錄</span>
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
                <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[18px]">{link.icon}</span>
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
              若您需要查詢、更正或刪除個人資料
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              聯絡電話與所在地區可於個人設定頁自行更新。姓名更正、資料查詢與複製本、帳號刪除或停止處理，請透過支援頁提出，中心將於核對身分後處理並回覆。
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
