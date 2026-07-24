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
  hint = "支援 Markdown：# 標題、**粗體**、*斜體*、- 清單、> 引用、[文字](網址)。",
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

  // 選取範圍前後包字（粗體/斜體）
  const surround = (marker: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || (marker === "**" ? "粗體文字" : "斜體文字");
    const next = value.slice(0, start) + marker + sel + marker + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + marker.length;
      ta.selectionEnd = start + marker.length + sel.length;
    });
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
    const next = value.slice(0, lineStart) + prefixed + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + prefixed.length;
    });
  };

  const insertLink = () => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value.slice(start, end) || "連結文字";
    const insert = `[${text}](https://)`;
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      // 選取 "https://" 供直接覆蓋
      const urlStart = start + text.length + 3; // `[` + text + `](`
      ta.selectionStart = urlStart;
      ta.selectionEnd = urlStart + "https://".length;
    });
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
