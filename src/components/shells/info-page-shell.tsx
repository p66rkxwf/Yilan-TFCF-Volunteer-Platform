import type { ReactNode } from "react";

// 資訊頁共用外框：扁平頁首（標題＋描述＋meta 文字列），無漸層 hero 卡片。
// eyebrow／icon 為選填的小標列，目前四個使用頁皆未帶入（原英文小標已移除）。

interface InfoPageShellProps {
  icon?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
}

export function InfoPageShell({
  icon,
  eyebrow,
  title,
  description,
  meta,
  children,
}: InfoPageShellProps) {
  return (
    <main className="w-full flex-1 bg-white">
      <div className="w-full px-4 py-6 sm:px-6">
      <div className="border-b border-slate-200 pb-5">
        {eyebrow ? (
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            {icon ? <span className="material-symbols-outlined text-[16px]">{icon}</span> : null}
            {eyebrow}
          </p>
        ) : null}
        <h1 className={`${eyebrow ? "mt-1.5 " : ""}text-2xl font-bold tracking-tight text-slate-900`}>
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
        {meta ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">{meta}</div>
        ) : null}
      </div>

      <div className="pt-6">{children}</div>
      </div>
    </main>
  );
}
