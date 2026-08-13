"use client";

// 點擊表頭排序：升 → 降 → 回預設（三態）。
//
// 排序做在前端，因為後台清單頁本來就是整份撈進來（.limit(500~2000)）後才在前端
// 篩選與分頁。重點是 sortRows 必須用在「分頁切片之前」——排在切片之後只會重排
// 當前這一頁，畫面看起來像壞掉。
//
// 第三態刻意回到 null 而非鎖在升／降：各頁的預設順序（待審核由舊到新、操作紀錄
// 由新到舊）本身就是有意義的工作順序，排過之後要回得去。

import { useCallback, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export type Comparators<T> = Record<string, (a: T, b: T) => number>;

export function useTableSort<T>(comparators: Comparators<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  const toggle = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }, []);

  // 刻意不包 useCallback：呼叫端都是在 render 期間直接呼叫（sortRows(filtered)），
  // 不會傳給 memo 化的子元件，包起來得不到任何好處，反而要把 comparators 列進
  // deps——而有些頁面的 comparators 依賴元件狀態（例如職員頁的「負責學生」筆數是
  // 另外查來的），每次 render 都是新物件，列進去等於沒 memo，不列進去則會閉包住
  // 載入前的舊值。當場閉包最新的一份最單純也最不會錯。
  const sortRows = (rows: T[]): T[] => {
    if (!sort) return rows;
    const cmp = comparators[sort.key];
    if (!cmp) return rows;
    // 取負號而非 reverse()：Array#sort 是穩定排序，負號能讓同值的列維持原本的
    // 相對順序；reverse() 會把它們也翻過來，同分列的次序會莫名其妙地跳動。
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => sign * cmp(a, b));
  };

  return { sort, toggle, sortRows };
}

// ===== 常用比較子 =====
// 皆為「升冪」語意；降冪由 useTableSort 取負號處理。

/** 中文字串。以 zh-Hant 定序，讓姓名排出來符合中文習慣而非碼位順序。 */
export function byText<T>(pick: (row: T) => string | null | undefined) {
  return (a: T, b: T) => (pick(a) ?? "").localeCompare(pick(b) ?? "", "zh-Hant");
}

/** ISO 時間字串。ISO 8601 的字典序即時間序，不必先轉成 Date。 */
export function byIso<T>(pick: (row: T) => string | null | undefined) {
  return (a: T, b: T) => (pick(a) ?? "").localeCompare(pick(b) ?? "");
}

/** 數值。空值視為最小，升冪時排在最前。 */
export function byNumber<T>(pick: (row: T) => number | null | undefined) {
  return (a: T, b: T) =>
    (pick(a) ?? Number.NEGATIVE_INFINITY) - (pick(b) ?? Number.NEGATIVE_INFINITY);
}

/** 布林。false 在前、true 在後。 */
export function byBoolean<T>(pick: (row: T) => boolean | null | undefined) {
  return (a: T, b: T) => Number(pick(a) ?? false) - Number(pick(b) ?? false);
}

/**
 * 狀態、學制這類列舉：依 rank 函式給的邏輯順序，而非中文字面。
 * rank 請用 lib/admin/labels.ts 的 rankBy(對照表) 產生。
 */
export function byRank<T, V extends string>(
  pick: (row: T) => V | null | undefined,
  rank: (value: V | null | undefined) => number
) {
  return (a: T, b: T) => rank(pick(a)) - rank(pick(b));
}
