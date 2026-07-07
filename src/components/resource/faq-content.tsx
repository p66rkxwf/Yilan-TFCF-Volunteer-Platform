"use client";

import Link from "next/link";
import { useState } from "react";

const CATEGORIES = [
  "全部",
  "帳號與登入",
  "活動報名",
  "個人資料",
  "通知與收藏",
] as const;

const FAQ_ITEMS = [
  {
    category: "帳號與登入",
    question: "如何建立志工帳號？",
    answer:
      "前往註冊頁填寫姓名、帳號、Email、生日與密碼即可建立帳號。註冊送出後帳號會進入待審核狀態，管理員審核通過並指派負責社工後即可開始報名。",
  },
  {
    category: "帳號與登入",
    question: "忘記密碼怎麼辦？",
    answer:
      "請使用登入頁的忘記密碼流程，系統會寄送重設密碼通知到您的 Email。若長時間未收到通知，請先檢查垃圾郵件匣。",
  },
  {
    category: "活動報名",
    question: "如何查看目前可報名的志工活動？",
    answer:
      "登入後進入志工專區即可瀏覽所有開放中的活動，您也可以使用搜尋欄位依活動名稱、地點或內容快速篩選。",
  },
  {
    category: "活動報名",
    question: "報名送出後，狀態會顯示在哪裡？",
    answer:
      "送出報名後，系統會將資料記錄在個人中心的報名紀錄中，並以待審核或已核准等狀態顯示，方便您追蹤處理進度。",
  },
  {
    category: "活動報名",
    question: "活動額滿後還可以線上候補嗎？",
    answer:
      "目前平台沒有開放候補名單功能。若活動額滿，建議您持續留意新增場次或直接聯繫平台管理窗口確認是否有候補安排。",
  },
  {
    category: "個人資料",
    question: "我可以修改 Email 或其他基本資料嗎？",
    answer:
      "登入後可於個人資料頁更新姓名、電話與地區；Email 請至帳號設定頁修改（需至新信箱完成驗證）。生日為管理員維護欄位，如需修改請聯絡管理員。",
  },
  {
    category: "個人資料",
    question: "哪裡可以看到我的收藏與報名紀錄？",
    answer:
      "個人中心提供收藏活動與報名紀錄兩個獨立頁面，方便您快速查看曾關注過的活動與目前的參與狀態。",
  },
  {
    category: "通知與收藏",
    question: "如何收藏想參加的活動？",
    answer:
      "在志工活動列表或活動詳情中點擊愛心圖示即可加入收藏。若尚未登入，系統會提醒您先完成登入後再使用收藏功能。",
  },
  {
    category: "通知與收藏",
    question: "平台會用哪些方式通知我？",
    answer:
      "目前平台以站內流程與 Email 為主，未來也可依單位需求整合其他通知方式。建議您保持 Email 資料正確，以免錯過重要更新。",
  },
  {
    category: "通知與收藏",
    question: "如果頁面無法正常顯示，該先檢查什麼？",
    answer:
      "請先重新整理頁面、確認網路連線與登入狀態，並嘗試使用最新版本的瀏覽器。如果問題持續，建議截圖後透過支援頁回報。",
  },
] as const;

const QUICK_LINKS = [
  {
    title: "服務條款",
    description: "查看活動報名、帳號使用與平台規範。",
    href: "/terms",
    icon: "gavel",
  },
  {
    title: "隱私政策",
    description: "了解資料蒐集、保存與使用方式。",
    href: "/privacy",
    icon: "shield_lock",
  },
  {
    title: "聯絡支援",
    description: "提交問題、錯誤畫面或帳號協助需求。",
    href: "/support",
    icon: "support_agent",
  },
] as const;

export function FaqContent() {
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof CATEGORIES)[number]>("全部");
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = FAQ_ITEMS.filter((item) => {
    const matchesCategory =
      selectedCategory === "全部" || item.category === selectedCategory;

    if (!matchesCategory) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const target = `${item.question}${item.answer}${item.category}`.toLowerCase();
    return target.includes(normalizedQuery);
  });

  return (
    <div className="space-y-8">
      {/* 搜尋 + 分類 */}
      <div>
        <div className="flex h-11 items-center rounded-lg border border-slate-200 bg-white px-3">
          <span className="material-symbols-outlined text-[20px] text-slate-400">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜尋帳號、報名、收藏、通知..."
            className="w-full border-none bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const isActive = category === selectedCategory;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isActive ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>

      {/* FAQ 清單（扁平 accordion） */}
      <div>
        <p className="mb-3 border-b border-slate-200 pb-2 text-sm text-slate-500">
          共找到 {filteredItems.length} 筆常見問題
        </p>
        {filteredItems.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item, index) => (
              <details key={item.question} open={index === 0} className="group py-1">
                <summary className="flex cursor-pointer items-center justify-between gap-4 py-3 text-left">
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      {item.category}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">{item.question}</h3>
                  </span>
                  <span className="material-symbols-outlined shrink-0 text-[20px] text-slate-400 transition-transform group-open:rotate-180">
                    expand_more
                  </span>
                </summary>
                <div className="pb-3 pl-1 text-sm leading-6 text-slate-600">{item.answer}</div>
              </details>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-300">search_off</span>
            <h3 className="mt-3 text-base font-bold text-slate-900">找不到符合條件的問題</h3>
            <p className="mt-1 text-sm text-slate-500">可嘗試更換關鍵字，或直接前往聯絡支援頁回報。</p>
            <Link
              href="/support"
              className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              前往聯絡支援
            </Link>
          </div>
        )}
      </div>

      {/* 相關文件 + 支援 */}
      <div className="border-t border-slate-200 pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">相關文件</p>
        <div className="mt-2 flex flex-col">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2.5 rounded px-2 py-2 transition-colors hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[20px] text-primary">{link.icon}</span>
              <span>
                <span className="text-sm font-semibold text-slate-800">{link.title}</span>
                <span className="ml-2 text-xs text-slate-500">{link.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
