// Lightweight CSV helpers (no external dependency).

function escapeCell(value: string | number | null | undefined): string {
  let str = value == null ? "" : String(value);

  // Neutralize formula injection: if the cell starts with a character that
  // spreadsheet apps interpret as a formula prefix (including a leading tab or
  // carriage return that a CSV parser may strip to expose the formula),
  // prepend a single quote so it's treated as literal text.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  // Prepend BOM so Excel reads UTF-8 (Chinese) correctly.
  return "﻿" + lines.join("\r\n");
}

// Triggers a browser download of the given CSV content. Client-side only.
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
