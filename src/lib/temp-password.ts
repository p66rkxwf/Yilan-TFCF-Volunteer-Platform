// 系統代設密碼用的一次性臨時密碼（後台建立帳號、管理員重設密碼）。
//
// 先前的做法是「密碼＝帳號」，有兩個問題：帳號下限 4 碼（isValidUsername）低於
// Supabase Auth 的密碼下限，短帳號根本建不了也重設不了；而且帳號對管理員與社工
// 都是可見的，等於重設後密碼即為公開資訊，知道帳號的人可搶在本人之前登入改密碼
// （must_change_password 只強制改密碼，擋不住登入）。改為隨機臨時密碼後，密碼強度
// 與帳號長度完全脫鉤。
//
// 格式為 xxxx-xxxx-xxxx（12 個隨機字元、共 14 碼）。分組是因為管理員多半以電話
// 口述轉告，字母表也刻意排除 i / l / o / 0 / 1 等易混淆字元。

// 31 碼字母表（a-z 去除 i l o；2-9 去除 0 1）。首字元恆為英數，
// 不會觸發 utils/csv.ts 的公式注入前綴逃逸，可安全寫入匯出的 CSV。
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 3;
const GROUP_LEN = 4;

// 均勻取樣：Uint8Array 上界 256 不是 31 的倍數，直接取模會讓前 8 個字元
// 機率略高，故捨棄落在尾端不完整區間的位元組後重抽。
function randomChars(count: number): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < count) {
    const bytes = new Uint8Array(count - out.length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limit) continue;
      out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

export function generateTempPassword(): string {
  const chars = randomChars(GROUPS * GROUP_LEN);
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN));
  }
  return groups.join("-");
}
