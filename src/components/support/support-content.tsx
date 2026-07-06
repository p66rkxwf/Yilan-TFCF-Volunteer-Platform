"use client";

import Link from "next/link";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { submitSupportRequest } from "@/lib/actions/support";

const TOPICS = [
  "帳號登入",
  "活動報名",
  "個人資料",
  "通知與收藏",
  "其他問題",
] as const;

type SupportTopic = (typeof TOPICS)[number];

const CONTACT_GUIDES = [
  {
    title: "回報前先準備",
    description: "帳號、活動名稱、操作步驟與錯誤截圖可加快處理。",
    icon: "assignment",
  },
  {
    title: "處理方式",
    description: "由平台管理團隊收到後依序處理，如需補充資料會再聯繫。",
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
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    topic: SupportTopic;
    message: string;
  }>({
    name: "",
    email: "",
    topic: TOPICS[0],
    message: "",
  });

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
    const result = await submitSupportRequest(formData);
    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error, "送出失敗");
      return;
    }

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
  };

  const fieldCls =
    "rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-600">姓名</span>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="請輸入您的姓名"
              className={fieldCls}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Email</span>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@example.com"
              className={fieldCls}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600">問題類型</span>
          <Select
            name="topic"
            value={formData.topic}
            ariaLabel="問題類型"
            onValueChange={(value) =>
              setFormData((current) => ({ ...current, topic: value as SupportTopic }))
            }
            triggerClassName="rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/20"
            menuClassName="bg-white"
            options={TOPICS.map((topic) => ({ value: topic, label: topic }))}
          />
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600">問題描述</span>
          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows={7}
            placeholder="請描述發生的情況、操作步驟，以及是否影響報名或登入。"
            className={`resize-none leading-6 ${fieldCls}`}
          />
        </label>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 md:flex-row md:items-center md:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            送出後將由平台管理團隊人工檢視。若問題與資料使用相關，也可同步參考隱私政策。
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-5 py-1.5 text-sm font-semibold text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "送出中..." : "送出支援需求"}
          </button>
        </div>
      </form>

      <aside className="lg:border-l lg:border-slate-200 lg:pl-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">回報須知</p>
        <ul className="mt-2 space-y-3">
          {CONTACT_GUIDES.map((guide) => (
            <li key={guide.title} className="flex gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-primary">{guide.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">{guide.title}</span>
                <span className="text-xs leading-5 text-slate-500">{guide.description}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">快速連結</p>
        <div className="mt-2 flex flex-col">
          {[
            { href: "/resource", label: "查看常見問題" },
            { href: "/terms", label: "服務條款" },
            { href: "/privacy", label: "隱私政策" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between rounded px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-primary/5 hover:text-primary"
            >
              {link.label}
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
