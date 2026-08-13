#!/usr/bin/env node
// 把 supabase/v2/*.sql 依編號順序套用到一個空的 Postgres（CI 與本機測試用）。
//
// 為什麼不是整檔一次送出：node-postgres 的 simple query protocol 會把多語句字串包成
// 單一隱含交易，而本目錄有數支檔案（07／21／27／33／42）會「新增 enum 值後立即使用」——
// Postgres 不允許在同一交易內這麼做。這也正是這些檔案在 Supabase SQL Editor 需要
// 手動分兩步貼上的原因（Editor 同樣包成一個交易）。
//
// 因此本腳本自行把每個檔案切成獨立語句逐一送出（等同 psql 的 autocommit 行為），
// 順帶讓「須分兩步驟」這件事在自動化流程中消失。
//
// 用法：
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
//     node scripts/apply-v2-sql.mjs [--bootstrap]
//
//   --bootstrap 會先套用 tests/db/bootstrap.sql（補出 Supabase 平台物件：
//   auth.users／auth.uid()／三個角色），供在 plain postgres 上跑測試。
//
//   --upto=NN 只套用到第 NN 號檔為止，用來重現「資料庫停在某個版本」的狀態。
//   例：--upto=38 可重現 39 尚未套用時的正式庫——DB 測試在該狀態下必須是紅燈，
//   否則就代表那些測試根本沒有真的在驗證守衛。

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_DIR = join(ROOT, "supabase", "v2");
const BOOTSTRAP = join(ROOT, "tests", "db", "bootstrap.sql");

// 切分 SQL 語句：需正確跳過字串、識別字、行/區塊註解，以及 plpgsql 大量使用的
// dollar-quoting（$$ ... $$ 或 $tag$ ... $tag$）——後者內部的分號不是語句結尾。
function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      const end = nl === -1 ? n : nl + 1;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") { depth++; j += 2; }
        else if (sql[j] === "*" && sql[j + 1] === "/") { depth--; j += 2; }
        else j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === ch && sql[j + 1] === ch) { j += 2; continue; } // 跳脫（'' 或 ""）
        if (sql[j] === ch) { j++; break; }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    if (ch === "$") {
      const m = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === ";") {
      out.push(buf);
      buf = "";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
  out.push(buf);

  // 濾掉純註解／空白的片段（切在最後一個分號之後的尾註解會產生這種片段）
  return out.filter((s) => {
    const bare = s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--[^\n]*/g, "")
      .trim();
    return bare.length > 0;
  });
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

async function run(label, sql, client) {
  const statements = splitStatements(sql);
  for (const [idx, stmt] of statements.entries()) {
    try {
      await client.query(stmt);
    } catch (e) {
      console.error(`\n✗ ${label} 第 ${idx + 1} 句失敗：${e.message}`);
      console.error(`\n--- 語句 ---\n${stmt.trim().slice(0, 800)}\n`);
      await client.end();
      process.exit(1);
    }
  }
  console.log(`✓ ${label}（${statements.length} 句）`);
  return statements.length;
}

if (process.argv.includes("--bootstrap")) {
  const c = new pg.Client({ connectionString });
  await c.connect();
  await run("bootstrap.sql", readFileSync(BOOTSTRAP, "utf8"), c);
  await c.end();
  // 必須重連：bootstrap 的 ALTER DATABASE ... SET search_path 只對新連線生效，
  // 而 01_schema.sql 的 EXCLUDE USING gist 需要 search_path 含 extensions。
}

const uptoArg = process.argv.find((a) => a.startsWith("--upto="));
const upto = uptoArg ? Number(uptoArg.slice("--upto=".length)) : Infinity;

const files = readdirSync(SQL_DIR)
  .filter((f) => /^\d{2}_.*\.sql$/.test(f))
  .filter((f) => Number(f.slice(0, 2)) <= upto)
  .sort();

const client = new pg.Client({ connectionString });
await client.connect();

let total = 0;
for (const file of files) {
  total += await run(file, readFileSync(join(SQL_DIR, file), "utf8"), client);
}

await client.end();
console.log(`\n完成：${files.length} 個檔案、${total} 句。`);
