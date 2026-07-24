"use client";

// 可重用 Markdown 編輯器：textarea + 簡單工具列（粗體/斜體/標題/清單/引用/連結）
// + 編輯/預覽切換（預覽沿用免疫 XSS 的 <Markdown> 元件）。
// 供活動說明、公告內容等長文欄位共用。

import { useRef, useState } from "react";
import { inputClass } from "@/components/admin/ui";
import { Markdown } from "@/components/admin/markdown";

interface ToolButton {
  label: string; // 供 aria-label / title
  icon: string; // Material Symbols 名稱
  action: "bold" | "italic" | "heading" | "ul" | "quote" | "link";
}

const TOOLS: ToolButton[] = [
  { label: "粗體", icon: "format_bold", action: "bold" },
  { label: "斜體", icon: "format_italic", action: "italic" },
  { label: "標題", icon: "title", action: "heading" },
  { label: "項目清單", icon: "format_list_bulleted", action: "ul" },
  { label: "引用", icon: "format_quote", action: "quote" },
  { label: "連結", icon: "link", action: "link" },
];

export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-48",
  hint,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  hint?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  // 以瀏覽器原生 execCommand 取代整段覆寫 value：保留原生復原（Ctrl+Z）歷史，
  // 並讓游標/捲動位置交由瀏覽器自己處理，避免手動重設位置造成的跳行問題。
  // 舊瀏覽器不支援 execCommand 時退回整段覆寫（僅該次操作無法原生復原）。
  const replaceRange = (
    rangeStart: number,
    rangeEnd: number,
    text: string,
    cursor: { start: number; end: number }
  ) => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(rangeStart, rangeEnd);
    const applied =
      typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, text);
    if (!applied) {
      onChange(value.slice(0, rangeStart) + text + value.slice(rangeEnd));
    }
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = cursor.start;
      ta.selectionEnd = cursor.end;
    });
  };

  // 選取範圍前後包字（粗體/斜體）；再次對已包字的範圍執行則取消標記（toggle）。
  const surround = (marker: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const m = marker.length;
    const selText = value.slice(start, end);

    // 選取範圍本身含頭尾標記（例如選到「**文字**」）→ 取消
    if (selText.length >= m * 2 && selText.startsWith(marker) && selText.endsWith(marker)) {
      const inner = selText.slice(m, selText.length - m);
      replaceRange(start, end, inner, { start, end: start + inner.length });
      return;
    }

    // 選取範圍緊鄰外側已是標記（游標在「**」與「**」之間）→ 一併取消外側標記
    const before = value.slice(Math.max(0, start - m), start);
    const after = value.slice(end, end + m);
    if (before === marker && after === marker) {
      const newStart = start - m;
      replaceRange(newStart, end + m, selText, { start: newStart, end: newStart + selText.length });
      return;
    }

    // 尚未包字 → 新增標記
    const text = selText || (marker === "**" ? "粗體文字" : "斜體文字");
    const wrapped = `${marker}${text}${marker}`;
    replaceRange(start, end, wrapped, { start: start + m, end: start + m + text.length });
  };

  // 於各行行首插入前綴（標題/清單/引用）
  const prefixLines = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end) || "文字";
    const prefixed = block
      .split("\n")
      .map((line) => prefix + line)
      .join("\n");
    replaceRange(lineStart, end, prefixed, { start: lineStart, end: lineStart + prefixed.length });
  };

  const insertLink = () => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value.slice(start, end) || "連結文字";
    const insert = `[${text}](https://)`;
    // 選取 "https://" 供直接覆蓋
    const urlStart = start + text.length + 3; // `[` + text + `](`
    replaceRange(start, end, insert, { start: urlStart, end: urlStart + "https://".length });
  };

  const run = (action: ToolButton["action"]) => {
    switch (action) {
      case "bold":
        return surround("**");
      case "italic":
        return surround("*");
      case "heading":
        return prefixLines("## ");
      case "ul":
        return prefixLines("- ");
      case "quote":
        return prefixLines("> ");
      case "link":
        return insertLink();
    }
  };

  const toggleBtn = (preview: boolean, text: string) => (
    <button
      type="button"
      onClick={() => setShowPreview(preview)}
      aria-pressed={showPreview === preview}
      className={`rounded-lg px-3 py-1 text-xs font-semibold ${
        showPreview === preview
          ? "bg-primary/10 text-primary"
          : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {text}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {toggleBtn(false, "編輯")}
        {toggleBtn(true, "預覽")}
        {!showPreview && (
          <div className="ml-1 flex items-center gap-0.5 border-l border-slate-200 pl-2">
            {TOOLS.map((tool) => (
              <button
                key={tool.action}
                type="button"
                onClick={() => run(tool.action)}
                aria-label={tool.label}
                title={tool.label}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  {tool.icon}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showPreview ? (
        <div className={`${minHeightClass} rounded-lg border border-slate-200 bg-slate-50/50 p-4`}>
          {value.trim() ? (
            <Markdown content={value} />
          ) : (
            <p className="text-sm text-slate-400">（無內容可預覽）</p>
          )}
        </div>
      ) : (
        <textarea
          id={id}
          ref={ref}
          className={`${inputClass} ${minHeightClass} font-mono text-sm`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
        />
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
