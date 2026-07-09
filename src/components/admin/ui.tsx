"use client";

// 後台共用 UI 原語：頁首、面板、狀態徽章、表格、工具列、分頁、批次列。
// 全後台頁面一律使用這裡的元件，維持一致的版面語言。

import Link from "next/link";
import React from "react";
import type { StatusMeta } from "@/lib/admin/labels";

export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
      {backHref && (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-primary"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          {backLabel ?? "返回"}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  padded = true,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section
      // 表格/清單面板（padded=false）給最小高度：短清單時篩選下拉（Select）不會被
      // 面板的 overflow-hidden 裁掉，選項才看得到。
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${
        padded ? "" : "min-h-96"
      } ${className}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

export function StatusPill({ meta }: { meta: StatusMeta }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}
    >
      {meta.label}
    </span>
  );
}

// ===== 表格 =====

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border-b border-slate-100 px-4 py-3 text-sm text-slate-700 ${className}`}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, message = "目前沒有資料" }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center text-sm text-slate-400">
        <span className="material-symbols-outlined mb-2 block text-4xl">inbox</span>
        {message}
      </td>
    </tr>
  );
}

export function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center text-sm text-slate-400">
        資料載入中…
      </td>
    </tr>
  );
}

// ===== 工具列（搜尋＋篩選） =====

export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "搜尋…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
        search
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
    </div>
  );
}

// ===== 分頁（client-side） =====

export function Pagination({
  page,
  pageCount,
  onPageChange,
  totalCount,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalCount?: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
      <p className="text-xs text-slate-500">
        第 {page} / {pageCount} 頁{totalCount != null ? `，共 ${totalCount} 筆` : ""}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一頁
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一頁
        </button>
      </div>
    </div>
  );
}

// ===== 批次操作列 =====

export function BatchBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-3 z-20 mx-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-white shadow-lg sm:mx-5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-bold">已選 {count} 筆</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-slate-300 underline-offset-2 hover:underline"
        >
          清除
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// ===== 頁籤（同頁分段切換，URL query 驅動） =====

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="scroll-x flex gap-1 border-b border-slate-200 bg-white px-4 sm:px-6">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                  isActive ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ===== 表單欄位包裝 =====

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** 驗證錯誤訊息，顯示於欄位下方 */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-slate-400">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

// ===== 列內操作選單（「⋯」按鈕，所有列表操作統一收合於此） =====

export interface RowAction {
  label: string;
  /** Material Symbols 圖示名稱 */
  icon?: string;
  /** 導頁型操作（編輯／管理等）；與 onSelect 擇一 */
  href?: string;
  onSelect?: () => void;
  /** 不可復原的破壞性操作（如永久刪除）以紅字呈現 */
  danger?: boolean;
  disabled?: boolean;
}

export function RowActionMenu({
  actions,
  ariaLabel = "操作選單",
  triggerLabel,
}: {
  actions: (RowAction | false | null | undefined)[];
  ariaLabel?: string;
  /** 給定文字時改渲染成帶框的「操作 ▾」按鈕（頁首用）；否則為列內「⋯」圖示鈕 */
  triggerLabel?: string;
}) {
  const items = actions.filter((a): a is RowAction => Boolean(a));
  const [isOpen, setIsOpen] = React.useState(false);
  // 選單以 fixed 定位渲染，避免被表格的 overflow 容器裁切
  const [position, setPosition] = React.useState<{ top: number; right: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    setIsOpen(false);
    setPosition(null);
  }, []);

  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = items.length * 38 + 12;
    const openUp = rect.bottom + menuHeight > window.innerHeight - 8;
    setPosition({
      top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setIsOpen(true);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen, close]);

  if (items.length === 0) return null;

  const itemClass = (action: RowAction) =>
    `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
      action.disabled
        ? "cursor-not-allowed text-slate-300"
        : action.danger
          ? "text-rose-600 hover:bg-rose-50"
          : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        className={
          triggerLabel
            ? `inline-flex items-center gap-1 rounded-lg border-2 border-zinc-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-zinc-100 ${
                isOpen ? "bg-zinc-100" : ""
              }`
            : `inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                isOpen
                  ? "bg-slate-100 text-slate-700"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`
        }
      >
        {triggerLabel ? (
          <>
            {triggerLabel}
            <span
              className={`material-symbols-outlined text-[18px] transition-transform ${isOpen ? "rotate-180" : ""}`}
            >
              expand_more
            </span>
          </>
        ) : (
          <span className="material-symbols-outlined text-[20px]">more_horiz</span>
        )}
      </button>
      {isOpen && position && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, right: position.right }}
          className="fixed z-[120] min-w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10"
        >
          {items.map((action) =>
            action.href && !action.disabled ? (
              <Link
                key={action.label}
                href={action.href}
                role="menuitem"
                onClick={close}
                className={itemClass(action)}
              >
                {action.icon && (
                  <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
                )}
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  close();
                  action.onSelect?.();
                }}
                className={itemClass(action)}
              >
                {action.icon && (
                  <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
                )}
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}

// ===== 描述清單（詳情頁用） =====

export function DescriptionItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-sm font-semibold text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
