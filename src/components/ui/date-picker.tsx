"use client";

// 自製日期選擇器（非原生 <input type=date>）：可直接打字，也可點日曆鈕開月曆挑日。
// popover 慣例（fixed 定位、外點/Esc/捲動關閉、鍵盤操作、aria）比照 components/ui/select.tsx。
// 值一律為 "YYYY-MM-DD"（或空字串）；打字時存原始字串，失焦以 normalizeDateInput 正規化，
// 失敗則保留原字串交由表單 submit 報錯。

import * as React from "react";
import { inputClass } from "@/components/admin/ui";
import { WEEKDAY_LABELS, normalizeDateInput, todayTaipeiDate } from "@/lib/admin/datetime";

const pad = (n: number) => String(n).padStart(2, "0");

// 純日曆（Y/M/D）運算一律走 UTC，避開時區/日光節約造成的偏移。
function fmt(y: number, m0: number, d: number): string {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}
function parse(value: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) };
}
function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
function firstWeekday(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0, 1)).getUTCDay();
}
function addDays(value: string, delta: number): string {
  const p = parse(value)!;
  const t = Date.UTC(p.y, p.m0, p.d) + delta * 86_400_000;
  const d = new Date(t);
  return fmt(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function DatePicker({
  id,
  value,
  onChange,
  disabled,
  invalid,
  min,
  max,
  className = "",
  inputClassName,
  placeholder = "2026-07-24",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  min?: string;
  max?: string;
  className?: string;
  /** 覆寫輸入框樣式（需自行預留右側日曆鈕空間 pr-10 與錯誤邊框）；不給則用預設 inputClass。 */
  inputClassName?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  // 目前檢視的年月，以及鍵盤焦點所在日
  const today = todayTaipeiDate();
  const initial = parse(value) ?? parse(today)!;
  const [viewY, setViewY] = React.useState(initial.y);
  const [viewM, setViewM] = React.useState(initial.m0);
  const [focusDate, setFocusDate] = React.useState<string>(value && parse(value) ? value : today);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dayRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const isDisabledDate = (v: string) => (min && v < min) || (max && v > max);

  const openCal = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const gap = 4;
      const desired = 340;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const openUp = spaceBelow < desired && rect.top > spaceBelow;
      setPos(
        openUp
          ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + gap }
          : { left: rect.left, width: rect.width, top: rect.bottom + gap }
      );
    }
    const start = value && parse(value) ? value : today;
    const p = parse(start)!;
    setViewY(p.y);
    setViewM(p.m0);
    setFocusDate(start);
    setOpen(true);
    window.requestAnimationFrame(() => dayRefs.current[start]?.focus());
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pick = (v: string) => {
    if (isDisabledDate(v)) return;
    onChange(v);
    close();
  };

  const moveFocus = (next: string) => {
    const p = parse(next)!;
    setViewY(p.y);
    setViewM(p.m0);
    setFocusDate(next);
    window.requestAnimationFrame(() => dayRefs.current[next]?.focus());
  };

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    const onReposition = () => close(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  const onDayKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        return moveFocus(addDays(focusDate, -1));
      case "ArrowRight":
        e.preventDefault();
        return moveFocus(addDays(focusDate, 1));
      case "ArrowUp":
        e.preventDefault();
        return moveFocus(addDays(focusDate, -7));
      case "ArrowDown":
        e.preventDefault();
        return moveFocus(addDays(focusDate, 7));
      case "PageUp": {
        e.preventDefault();
        const dm = e.shiftKey ? -12 : -1;
        const t = new Date(Date.UTC(parse(focusDate)!.y, parse(focusDate)!.m0 + dm, parse(focusDate)!.d));
        return moveFocus(fmt(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      }
      case "PageDown": {
        e.preventDefault();
        const dm = e.shiftKey ? 12 : 1;
        const t = new Date(Date.UTC(parse(focusDate)!.y, parse(focusDate)!.m0 + dm, parse(focusDate)!.d));
        return moveFocus(fmt(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      }
      case "Enter":
      case " ":
        e.preventDefault();
        return pick(focusDate);
      case "Escape":
        e.preventDefault();
        return close();
    }
  };

  const shiftMonth = (delta: number) => {
    const t = new Date(Date.UTC(viewY, viewM + delta, 1));
    setViewY(t.getUTCFullYear());
    setViewM(t.getUTCMonth());
  };
  const shiftYear = (delta: number) => setViewY((y) => y + delta);

  const total = daysInMonth(viewY, viewM);
  const lead = firstWeekday(viewY, viewM);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  const navBtn = "flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-40";

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={inputClassName ?? `${inputClass} pr-10 ${invalid ? "border-amber-400" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const norm = normalizeDateInput(value);
          if (norm && norm !== value) onChange(norm);
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label="開啟日曆"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openCal())}
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          calendar_month
        </span>
      </button>

      {open && pos ? (
        <div
          role="dialog"
          aria-label="選擇日期"
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: Math.max(pos.width, 260) }}
          className="z-[200] rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <button type="button" className={navBtn} aria-label="上一年" onClick={() => shiftYear(-1)}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">keyboard_double_arrow_left</span>
              </button>
              <button type="button" className={navBtn} aria-label="上個月" onClick={() => shiftMonth(-1)}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
              </button>
            </div>
            <span className="text-sm font-semibold text-slate-800" aria-live="polite">
              {viewY} 年 {viewM + 1} 月
            </span>
            <div className="flex items-center gap-0.5">
              <button type="button" className={navBtn} aria-label="下個月" onClick={() => shiftMonth(1)}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
              </button>
              <button type="button" className={navBtn} aria-label="下一年" onClick={() => shiftYear(1)}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">keyboard_double_arrow_right</span>
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-xs text-slate-400">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="py-1">{w}</span>
            ))}
          </div>

          <div role="group" aria-label="日期" className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day == null) return <span key={`b-${i}`} />;
              const v = fmt(viewY, viewM, day);
              const isSelected = v === value;
              const isToday = v === today;
              const isFocus = v === focusDate;
              const off = isDisabledDate(v);
              return (
                <button
                  key={v}
                  type="button"
                  ref={(node) => {
                    dayRefs.current[v] = node;
                  }}
                  tabIndex={isFocus ? 0 : -1}
                  disabled={!!off}
                  aria-pressed={isSelected}
                  aria-label={`${viewY} 年 ${viewM + 1} 月 ${day} 日`}
                  onClick={() => pick(v)}
                  onKeyDown={onDayKeyDown}
                  className={`flex h-9 items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30 ${
                    isSelected
                      ? "bg-primary font-semibold text-white"
                      : isToday
                        ? "font-semibold text-primary ring-1 ring-inset ring-primary/40 hover:bg-primary/10"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
