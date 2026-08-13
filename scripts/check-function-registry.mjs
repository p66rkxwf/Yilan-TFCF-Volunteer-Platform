#!/usr/bin/env node
// 函式版本登記表檢查（對應 supabase/v2/FUNCTIONS.md）
//
// 為什麼需要這支：supabase/v2/ 以「複製整支函式、改其中幾行」的方式做增量修補。
// 若某一檔挑錯複製來源（挑到舊版而非最新版），中間版本新增的條件就會整段消失，
// 而 CREATE OR REPLACE 不會有任何警告。34_fix_archived_volunteer_guards.sql 即是
// 如此把 21 的 Email 驗證關卡洗掉的（檔頭還寫著「已確認未被覆蓋過」）。
//
// 本腳本掃描所有 CREATE [OR REPLACE] FUNCTION/VIEW public.<name>，算出每個物件的
// 實際覆蓋鏈，與 FUNCTIONS.md 記載的內容比對。不一致就失敗——強迫任何新增覆蓋的
// 人回去更新登記表，順帶看見「這支函式已經被改過幾次、canonical 在哪一檔」。
//
// 用法：
//   node scripts/check-function-registry.mjs          # 檢查（CI 用，不符即 exit 1）
//   node scripts/check-function-registry.mjs --write  # 依現況重寫 FUNCTIONS.md 的表格

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_DIR = join(ROOT, "supabase", "v2");
const REGISTRY = join(SQL_DIR, "FUNCTIONS.md");

const START = "<!-- BEGIN GENERATED TABLE -->";
const END = "<!-- END GENERATED TABLE -->";

// 只認行首的宣告，避免命中註解或字串裡的同名文字。
const DECL = /^CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|VIEW)\s+public\.(\w+)/gim;

function scan() {
  const files = readdirSync(SQL_DIR)
    .filter((f) => /^\d{2}_.*\.sql$/.test(f))
    .sort();

  /** @type {Map<string, { kind: string, chain: string[] }>} */
  const objects = new Map();
  for (const file of files) {
    const num = file.slice(0, 2);
    const sql = readFileSync(join(SQL_DIR, file), "utf8");
    // 同一檔內重複宣告同一物件只記一次（實務上不會，但別讓鏈變長）。
    const seen = new Set();
    for (const m of sql.matchAll(DECL)) {
      const kind = m[1].toLowerCase();
      const name = m[2];
      if (seen.has(name)) continue;
      seen.add(name);
      const entry = objects.get(name) ?? { kind, chain: [] };
      entry.chain.push(num);
      objects.set(name, entry);
    }
  }
  return objects;
}

function renderTable(objects) {
  const rows = [...objects.entries()].sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    "| 物件 | 種類 | 覆蓋鏈（依編號） | canonical |",
    "| --- | --- | --- | --- |",
  ];
  for (const [name, { kind, chain }] of rows) {
    const canonical = chain[chain.length - 1];
    const flag = chain.length > 1 ? " ⚠️" : "";
    lines.push(
      `| \`${name}\` | ${kind} | ${chain.join(" → ")}${flag} | **${canonical}** |`
    );
  }
  return lines.join("\n");
}

function parseRegistry(md) {
  /** @type {Map<string, string[]>} */
  const recorded = new Map();
  const body = md.split(START)[1]?.split(END)[0] ?? "";
  for (const line of body.split("\n")) {
    const m = line.match(/^\|\s*`(\w+)`\s*\|\s*\w+\s*\|\s*([\d\s→]+?)(?:\s*⚠️)?\s*\|/);
    if (m) recorded.set(m[1], m[2].trim().split(/\s*→\s*/));
  }
  return recorded;
}

const objects = scan();

if (process.argv.includes("--write")) {
  const md = readFileSync(REGISTRY, "utf8");
  const next =
    md.split(START)[0] + START + "\n\n" + renderTable(objects) + "\n\n" + END + md.split(END)[1];
  writeFileSync(REGISTRY, next);
  console.log(`已更新 ${REGISTRY}（${objects.size} 個物件）`);
  process.exit(0);
}

let md;
try {
  md = readFileSync(REGISTRY, "utf8");
} catch {
  console.error(`找不到 ${REGISTRY}。請先執行：node scripts/check-function-registry.mjs --write`);
  process.exit(1);
}

const recorded = parseRegistry(md);
const problems = [];

for (const [name, { chain }] of objects) {
  const rec = recorded.get(name);
  if (!rec) {
    problems.push(
      `新物件未登記：${name}（覆蓋鏈 ${chain.join(" → ")}）` +
        (chain.length > 1
          ? `\n    ⚠️ 這支被覆蓋過 ${chain.length} 次，改動前務必確認你是從 ${chain[chain.length - 1]} 複製，而非更舊的版本。`
          : "")
    );
    continue;
  }
  if (rec.join(" → ") !== chain.join(" → ")) {
    problems.push(
      `覆蓋鏈不符：${name}\n    登記表：${rec.join(" → ")}\n    實際：  ${chain.join(" → ")}`
    );
  }
}

for (const name of recorded.keys()) {
  if (!objects.has(name)) problems.push(`登記表有但 SQL 中找不到：${name}`);
}

if (problems.length > 0) {
  console.error("函式版本登記表與 supabase/v2/*.sql 不一致：\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\n若這些覆蓋是刻意的，請確認每一支都是從 canonical 版本複製而來，" +
      "\n然後執行 node scripts/check-function-registry.mjs --write 更新登記表。"
  );
  process.exit(1);
}

console.log(`函式版本登記表一致（${objects.size} 個物件）`);
