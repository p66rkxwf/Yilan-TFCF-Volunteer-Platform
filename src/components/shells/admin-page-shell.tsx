import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  right?: ReactNode;
}

interface AdminMetricCardProps {
  label: string;
  value: ReactNode;
  description: string;
  icon: string;
  accent?: string;
  meta?: string;
}

interface AdminPanelProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  right,
}: AdminPageHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white p-6 flex-shrink-0">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            {eyebrow}
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>

        {right ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto xl:min-w-[24rem] xl:items-center xl:justify-end">
            {right}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function AdminMetricCard({
  label,
  value,
  description,
  icon,
  accent = "bg-primary/10 text-primary",
  meta = "Overview",
}: AdminMetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={joinClasses("rounded-xl p-2.5", accent)}>
          <span className="material-symbols-outlined text-[22px]">{icon}</span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {meta}
        </span>
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-1 text-3xl font-black tracking-tight text-slate-900">
        {value}
      </div>
      <p className="mt-2 text-xs text-slate-400">{description}</p>
    </div>
  );
}

export function AdminPanel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: AdminPanelProps) {
  return (
    <section
      className={joinClasses(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
        className
      )}
    >
      {title || description || action ? (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? <h3 className="text-lg font-bold text-slate-900">{title}</h3> : null}
            {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName || "p-6"}>{children}</div>
    </section>
  );
}

