"use client";

import { useState } from "react";

const CATEGORIES = [
  "全部類別",
  "成績優異",
  "經濟扶助",
  "特殊才藝",
  "研究計畫",
] as const;

type Category = (typeof CATEGORIES)[number];

interface Scholarship {
  id: string;
  title: string;
  subtitle: string;
  organization: string;
  category: Category;
  deadline: string;
  amount: string;
  description: string;
  eligibility: string;
  contact: string;
  imageUrl: string;
}

const SCHOLARSHIPS: Scholarship[] = [
  {
    id: "1",
    title: "Global Excellence Scholarship",
    subtitle: "全球卓越獎學金",
    organization: "Academic Foundation of Excellence",
    category: "成績優異",
    deadline: "2024年10月15日",
    amount: "$10,000",
    description:
      "本獎學金旨在鼓勵學業成績卓越的學生繼續追求學術成就。獎學金涵蓋學費及生活費補助，獲獎者將有機會參加國際學術交流計畫，拓展國際視野。",
    eligibility: "GPA 3.5 以上，具備社區服務經歷，需提交推薦信兩封。",
    contact: "scholarship@foundation.edu",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCRkxcwb7AcP8i845VhdjwGriRHWQ-qFR1xqKg0kAPdmydvHsN8N56e9DooqKn3hnIOU9U5AbMkEhSUxkbyKyvNkVISnUtkE9f3YrZohAHQlb8gifzrJ5JFGv80B6fLxA931_vKw4zYlskWapQmzYkot4BptjsVgQ5UHQCAjhmaU2D1M7Q3-XO7PpI7CiP1GXeueTZp9-_Xw_PwVYdX7EayGWtui_DTKOpsyUx4uSkWFahTpQkTm7dOjHfMr7Udwoe2zS--eiENsLKB",
  },
  {
    id: "2",
    title: "STEM Innovation Grant",
    subtitle: "STEM 創新補助",
    organization: "National Science & Technology Institute",
    category: "研究計畫",
    deadline: "2024年11月1日",
    amount: "$15,500",
    description:
      "支持理工科學領域的創新研究計畫。獲獎學生將獲得研究經費補助，並有機會在國際學術會議上發表研究成果。鼓勵跨領域合作與實際問題解決方案。",
    eligibility: "理工相關科系學生，需提交研究計畫書，指導教授推薦信一封。",
    contact: "stem@nsti.org",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDSGC3LhD4oxdDo23EjPkVbYouleAdfWVSF-aEj98FzVoDiUnogijkreiKlMqzMUmoDO997CAnXsYw_351rIxn26QG8Qczo2ajuWbD-BzHLFYdQMRTvIfcSPDpXtbuwox3rRUDW4eBSAvetHJlXld1QvDj7nvcMI279YnKOUu785dWlntBCrhHON88TJBwqeDfoGBlUjSLfOztMKMZ5zPgqLxY9N59ywUaODwDIV5hE2ATahgi9Fhv5up9RJbpukatRro7-53UDGSra",
  },
  {
    id: "3",
    title: "Community Leaders Fund",
    subtitle: "社區領袖基金",
    organization: "Social Impact Coalition",
    category: "經濟扶助",
    deadline: "2024年12月15日",
    amount: "Full Tuition",
    description:
      "針對經濟弱勢但具領導潛力的學生提供全額學費補助。獲獎者需承諾在學期間參與社區服務專案，培養領導能力並回饋社會。",
    eligibility: "家庭年收入符合中低收入標準，需提交個人自傳與服務計畫書。",
    contact: "leaders@socialimpact.org",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBR5RMUn5yg8x3-DwMWY4iAC_XTyQFu_jh-Bd2KkDfU_sJAZn1YdrO7-53QmuS7vjsjk2gpOjugxS3ZY8-UQ-Y_B9rdghNiu1UldQjwt8frxoP2uDESLhFkuRKkhv6-3nkK0Ox7XPn1ewD_9lj3QxqbM7bPHQS_ZhEYLvafIM-kZzzzZJeBCAVdGEAe2pgj5A7IGpi9qIizlkuuIcMCLQMNK2YYFWPMKK_oPo2v9GCKFXn2tDsiVCFIaHcgxXjWuzFzKOhOV5QKDull",
  },
];

function ScholarshipDetailModal({
  scholarship,
  onClose,
}: {
  scholarship: Scholarship;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 md:p-12 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {scholarship.title}
            </h1>
            <p className="text-slate-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">
                corporate_fare
              </span>
              {scholarship.organization}
            </p>
          </div>
          <button
            className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 md:p-12 space-y-8">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
              獎學金說明
            </h3>
            <p className="text-slate-700 leading-relaxed">
              {scholarship.description}
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                申請截止日期
              </h3>
              <p className="text-lg font-medium text-red-600">
                {scholarship.deadline}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                獎助金額
              </h3>
              <p className="text-lg font-medium">{scholarship.amount}</p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                類別
              </h3>
              <p className="text-lg font-medium">{scholarship.category}</p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                聯絡信箱
              </h3>
              <p className="text-lg font-medium">{scholarship.contact}</p>
            </div>
          </div>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
              申請資格
            </h3>
            <p className="text-slate-700 leading-relaxed">
              {scholarship.eligibility}
            </p>
          </section>

          <div className="pt-8 mt-8 border-t border-slate-100">
            <button className="w-full md:w-auto px-12 py-4 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors">
              立即申請
            </button>
            <p className="text-xs text-slate-400 mt-4 text-center md:text-left">
              申請即表示您同意本平台的服務條款與隱私權政策。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScholarshipCard({
  scholarship,
  onViewDetail,
}: {
  scholarship: Scholarship;
  onViewDetail: () => void;
}) {
  return (
    <div className="flex flex-col md:flex-row items-stretch bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="w-full md:w-48 bg-slate-100 flex items-center justify-center p-6 grayscale">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Organization Logo"
          className="max-h-24 opacity-60"
          src={scholarship.imageUrl}
        />
      </div>
      <div className="flex flex-1 flex-col justify-between p-6">
        <div className="mb-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">
              {scholarship.title}
            </h3>
            <span className="shrink-0 ml-3 px-2 py-1 bg-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-600 rounded">
              {scholarship.category}
            </span>
          </div>
          <p className="text-slate-500 text-sm mb-4 font-medium">
            {scholarship.organization}
          </p>
          <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">
                calendar_today
              </span>
              <span>
                截止日期：
                <span className="font-semibold text-slate-900">
                  {scholarship.deadline}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">
                payments
              </span>
              <span>
                獎助金額：
                <span className="font-semibold text-slate-900">
                  {scholarship.amount}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            onClick={onViewDetail}
            className="border border-slate-200 text-slate-700 px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
          >
            查看詳情
          </button>
          <button className="bg-primary hover:bg-primary/90 text-white px-8 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors">
            立即申請
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScholarshipPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("全部類別");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScholarship, setSelectedScholarship] =
    useState<Scholarship | null>(null);

  const filtered = SCHOLARSHIPS.filter((s) => {
    const matchCategory =
      activeCategory === "全部類別" || s.category === activeCategory;
    const matchSearch =
      searchQuery === "" ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.subtitle.includes(searchQuery) ||
      s.organization.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <>
      <main className="flex flex-1 justify-center py-10 px-6 md:px-20">
        <div className="flex flex-col max-w-5xl flex-1">
          {/* Title */}
          <div className="flex flex-wrap justify-between gap-3 mb-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-slate-900 text-4xl font-black leading-tight tracking-tight uppercase">
                Scholarships
              </h1>
              <p className="text-slate-500 text-base font-normal">
                瀏覽可申請的獎學金項目，為您的學業發展尋找最佳資助機會。
              </p>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col gap-6 mb-10">
            <div className="flex w-full items-stretch rounded-lg h-14 bg-white border border-slate-200 shadow-sm">
              <div className="text-slate-400 flex items-center justify-center pl-4">
                <span className="material-symbols-outlined">search</span>
              </div>
              <input
                className="w-full min-w-0 flex-1 border-none bg-transparent focus:ring-0 text-slate-900 px-4 text-base placeholder:text-slate-400"
                placeholder="以關鍵字、機構或領域搜尋..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={
                    activeCategory === cat
                      ? "flex h-10 items-center justify-center gap-x-2 rounded px-4 bg-slate-900 text-white text-sm font-bold uppercase tracking-wide"
                      : "flex h-10 items-center justify-center gap-x-2 rounded px-4 border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:border-slate-400 transition-colors uppercase tracking-wide"
                  }
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Scholarship List */}
          <div className="grid grid-cols-1 gap-4">
            {filtered.length > 0 ? (
              filtered.map((s) => (
                <ScholarshipCard
                  key={s.id}
                  scholarship={s}
                  onViewDetail={() => setSelectedScholarship(s)}
                />
              ))
            ) : (
              <div className="text-center py-16 text-slate-400">
                <span className="material-symbols-outlined text-5xl mb-4 block">
                  search_off
                </span>
                <p className="text-lg">找不到符合條件的獎學金項目</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex justify-center mt-12 mb-8">
            <nav className="flex items-center gap-1">
              <button className="flex size-10 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 transition-colors">
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button className="flex size-10 items-center justify-center rounded bg-slate-900 text-white font-bold">
                1
              </button>
              <button className="flex size-10 items-center justify-center rounded border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors">
                2
              </button>
              <button className="flex size-10 items-center justify-center rounded border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors">
                3
              </button>
              <span className="px-2 text-slate-400">...</span>
              <button className="flex size-10 items-center justify-center rounded border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors">
                8
              </button>
              <button className="flex size-10 items-center justify-center rounded border border-slate-200 hover:bg-slate-50 transition-colors">
                <span className="material-symbols-outlined">
                  chevron_right
                </span>
              </button>
            </nav>
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      {selectedScholarship && (
        <ScholarshipDetailModal
          scholarship={selectedScholarship}
          onClose={() => setSelectedScholarship(null)}
        />
      )}
    </>
  );
}
