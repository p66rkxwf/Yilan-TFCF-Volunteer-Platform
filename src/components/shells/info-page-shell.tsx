import type { ReactNode } from "react";

interface InfoPageShellProps {
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
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
    <main className="flex-1">
      <section className="border-b border-slate-200 bg-white">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(22,89,156,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(246,247,248,1)_100%)]" />
          <div className="absolute left-[-6rem] top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-[-3rem] top-[-2rem] h-44 w-44 rounded-full bg-slate-200/70 blur-3xl" />

          <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 md:px-16 md:py-20">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-primary">
                  <span className="material-symbols-outlined text-[18px]">
                    {icon}
                  </span>
                  {eyebrow}
                </span>
                <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
                  {title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                  {description}
                </p>
              </div>

              {meta ? (
                <div className="grid gap-3 sm:grid-cols-2 md:w-[320px] md:grid-cols-1">
                  {meta}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10 md:px-16 md:py-14">
        {children}
      </section>
    </main>
  );
}

