// 前台共用版面原語：白底畫布上的「標題＋分隔線」區塊，與「左標籤·右內容」列。
// 字級對齊後台的精簡尺寸（區塊標題 text-base、內文 text-sm、次要 text-xs）。

import React from "react";

export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// 左標籤·右內容一列（label-left rows）；children 可為純文字或 <input>。
// 手機：標籤在上、內容在下；桌面：標籤靠左固定寬、內容佔滿右側。
export function InfoRow({
  label,
  children,
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={`flex flex-col gap-1 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:gap-4 ${
        align === "center" ? "sm:items-center" : "sm:items-start"
      }`}
    >
      <dt className="shrink-0 text-sm text-slate-500 sm:w-28 sm:pt-0">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
