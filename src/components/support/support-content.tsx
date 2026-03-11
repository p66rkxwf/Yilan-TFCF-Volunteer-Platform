"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

const TOPICS = [
  "帳號登入",
  "活動報名",
  "個人資料",
  "通知與收藏",
  "其他問題",
] as const;

const CONTACT_GUIDES = [
  {
    title: "回報前先準備",
    description: "帳號、活動名稱、操作步驟與錯誤截圖可加快處理。",
    icon: "assignment",
  },
  {
    title: "回覆時程",
    description: "一般問題建議預留 1 至 2 個工作天，由平台管理團隊回覆。",
    icon: "schedule",
  },
  {
    title: "文件入口",
    description: "若是政策或權限問題，可先查看服務條款與隱私政策。",
    icon: "menu_book",
  },
] as const;

export function SupportContent() {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    topic: TOPICS[0],
    message: "",
  });

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      toast.error("請先完整填寫姓名、Email 與問題描述。", "欄位未完成");
      return;
    }

    setIsSubmitting(true);
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    toast.success(
      "我們已收到您的訊息。若需補充資料，平台管理團隊會再與您聯繫。",
      "已送出"
    );

    setFormData({
      name: "",
      email: "",
      topic: TOPICS[0],
      message: "",
    });
    setIsSubmitting(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 md:p-8"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-slate-900">姓名</span>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="請輸入您的姓名"
              className="rounded-2xl border border-slate-200 bg-background-light px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-slate-900">Email</span>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@example.com"
              className="rounded-2xl border border-slate-200 bg-background-light px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>

        <label className="mt-5 flex flex-col gap-2">
          <span className="text-sm font-bold text-slate-900">問題類型</span>
          <select
            name="topic"
            value={formData.topic}
            onChange={handleChange}
            className="rounded-2xl border border-slate-200 bg-background-light px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-5 flex flex-col gap-2">
          <span className="text-sm font-bold text-slate-900">問題描述</span>
          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows={7}
            placeholder="請描述發生的情況、操作步驟，以及是否影響報名或登入。"
            className="resize-none rounded-3xl border border-slate-200 bg-background-light px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-sm leading-6 text-slate-500">
            送出後將由平台管理團隊人工檢視。若問題與資料使用相關，也可同步參考隱私政策。
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "送出中..." : "送出支援需求"}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {CONTACT_GUIDES.map((guide) => (
          <div
            key={guide.title}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined">{guide.icon}</span>
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">
              {guide.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {guide.description}
            </p>
          </div>
        ))}

        <div className="rounded-3xl bg-slate-900 p-6 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
            Quick Access
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <Link
              href="/resource"
              className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/10"
            >
              <span>查看常見問題</span>
              <span className="material-symbols-outlined text-[18px]">
                arrow_forward
              </span>
            </Link>
            <Link
              href="/terms"
              className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/10"
            >
              <span>服務條款</span>
              <span className="material-symbols-outlined text-[18px]">
                arrow_forward
              </span>
            </Link>
            <Link
              href="/privacy"
              className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/10"
            >
              <span>隱私政策</span>
              <span className="material-symbols-outlined text-[18px]">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
