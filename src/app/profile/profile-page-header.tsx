// 個人中心各頁共用頁首（取代原本每頁各自複製的 h-16 header）。

import React from "react";

export function ProfilePageHeader({
  title,
  actions,
  noPrint = false,
}: {
  title: string;
  actions?: React.ReactNode;
  noPrint?: boolean;
}) {
  return (
    <header
      className={`flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 md:px-8 ${
        noPrint ? "no-print" : ""
      }`}
    >
      <h1 className="text-lg font-bold">{title}</h1>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
