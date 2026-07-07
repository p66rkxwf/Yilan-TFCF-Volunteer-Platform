// 極簡 Markdown 渲染器：直接產生 React 元素（不經 HTML 字串、
// 不用 dangerouslySetInnerHTML），天然免疫 XSS。
// 支援：#~#### 標題、粗體、斜體、行內程式碼、連結（僅 http/https）、
// 無序/有序清單、引用、水平線、段落（段內換行保留）。

import React from "react";

type InlineNode = React.ReactNode;

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const BOLD_RE = /\*\*([^*]+)\*\*/;
const ITALIC_RE = /\*([^*]+)\*/;
const CODE_RE = /`([^`]+)`/;

function renderInline(text: string, keyPrefix: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;
  let index = 0;

  while (rest.length > 0) {
    // 找出最先出現的行內語法
    const candidates: { type: "link" | "bold" | "italic" | "code"; match: RegExpMatchArray }[] = [];
    const link = rest.match(LINK_RE);
    if (link?.index != null) candidates.push({ type: "link", match: link });
    const bold = rest.match(BOLD_RE);
    if (bold?.index != null) candidates.push({ type: "bold", match: bold });
    const italic = rest.match(ITALIC_RE);
    if (italic?.index != null) candidates.push({ type: "italic", match: italic });
    const code = rest.match(CODE_RE);
    if (code?.index != null) candidates.push({ type: "code", match: code });

    if (candidates.length === 0) {
      nodes.push(rest);
      break;
    }

    candidates.sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0));
    const first = candidates[0];
    const matchIndex = first.match.index ?? 0;

    if (matchIndex > 0) nodes.push(rest.slice(0, matchIndex));

    const key = `${keyPrefix}-${index++}`;
    if (first.type === "link") {
      nodes.push(
        <a
          key={key}
          href={first.match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {renderInline(first.match[1], `${key}-t`)}
        </a>
      );
    } else if (first.type === "bold") {
      nodes.push(<strong key={key}>{renderInline(first.match[1], `${key}-t`)}</strong>);
    } else if (first.type === "italic") {
      nodes.push(<em key={key}>{renderInline(first.match[1], `${key}-t`)}</em>);
    } else {
      nodes.push(
        <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">
          {first.match[1]}
        </code>
      );
    }

    rest = rest.slice(matchIndex + first.match[0].length);
  }

  return nodes;
}

function renderInlineWithBreaks(lines: string[], keyPrefix: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) nodes.push(<br key={`${keyPrefix}-br-${i}`} />);
    nodes.push(...renderInline(line, `${keyPrefix}-l${i}`));
  });
  return nodes;
}

const HEADING_CLASSES: Record<number, string> = {
  1: "text-xl font-bold text-slate-900",
  2: "text-lg font-bold text-slate-900",
  3: "text-base font-bold text-slate-900",
  4: "text-sm font-bold text-slate-900",
};

export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockIndex = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const key = `md-${blockIndex++}`;

    if (trimmed === "") {
      i++;
      continue;
    }

    // 水平線
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key} className="my-4 border-slate-200" />);
      i++;
      continue;
    }

    // 標題
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      blocks.push(
        <Tag key={key} className={`${HEADING_CLASSES[level]} mt-4 mb-2 first:mt-0`}>
          {renderInline(heading[2], key)}
        </Tag>
      );
      i++;
      continue;
    }

    // 引用（連續 > 行）
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key} className="my-3 border-l-4 border-slate-200 pl-3 text-slate-600">
          {renderInlineWithBreaks(quoteLines, key)}
        </blockquote>
      );
      continue;
    }

    // 無序清單
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, j) => (
            <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 有序清單
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((item, j) => (
            <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // 段落：收集到空行為止，段內換行以 <br> 保留
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith(">") &&
      !/^(-{3,}|\*{3,})$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key} className="my-2 leading-relaxed first:mt-0 last:mb-0">
        {renderInlineWithBreaks(paragraphLines, key)}
      </p>
    );
  }

  return <div className={`text-sm text-slate-700 ${className}`}>{blocks}</div>;
}
