"use client";

// 首頁頂部置頂公告橫幅。多則置頂時每 5 秒輪播；點擊進入最新消息頁。

import Link from "next/link";
import { useEffect, useState } from "react";

export interface BannerItem {
  id: string;
  title: string;
}

export function AnnouncementBanner({ items }: { items: BannerItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[Math.min(index, items.length - 1)];

  return (
    <Link
      href={`/announcements/${current.id}`}
      className="group flex items-center gap-3 border-b border-primary/20 bg-primary/5 px-6 py-2.5 text-sm transition-colors hover:bg-primary/10 md:px-16"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-white">
        <span aria-hidden="true" className="material-symbols-outlined text-[15px]">campaign</span>
        公告
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-slate-700 group-hover:text-primary">
        {current.title}
      </span>
      {items.length > 1 && (
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {items.map((item, i) => (
            <span
              key={item.id}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === index ? "bg-primary" : "bg-primary/25"
              }`}
            />
          ))}
        </span>
      )}
      <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[18px] text-primary/60 transition-transform group-hover:translate-x-0.5">
        chevron_right
      </span>
    </Link>
  );
}
