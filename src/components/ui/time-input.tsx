"use client";

// 免冒號時間輸入：使用者只打數字，輸入到第 2 位（時）後自動補上冒號，
// 繼續打即為分。值一律維持 "HH:mm" 形式的部分字串（如 "1"、"14:"、"14:0"、"14:05"）。
// 不在此硬驗證；送出時交由 normalizeTimeInput（src/lib/admin/datetime.ts）把關。

import { inputClass } from "@/components/admin/ui";

// 由使用者輸入重建：抽出數字、取前 4 碼，輸入到第 2 碼（時）後即補上冒號。
function maskTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length < 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function TimeInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  className = "",
  placeholder = "HH:mm",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // 退格把冒號刪掉時（"14:" → "14"），連同前一碼一起刪，避免游標卡在冒號前。
    if (value.endsWith(":") && raw === value.slice(0, -1)) {
      onChange(maskTime(raw.slice(0, -1)));
      return;
    }
    onChange(maskTime(raw));
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`${inputClass} ${invalid ? "border-amber-400" : ""} ${className}`}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      maxLength={5}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
    />
  );
}
