// rpc_register_for_session 的守衛矩陣。
//
// 這支測試存在的直接理由：34_fix_archived_volunteer_guards.sql 為了補 deleted_at 而
// 從 04 複製整支函式，把 21 加的「未驗證 Email 不得報名」洗掉了，而且沒有任何自動檢查
// 抓得到——正式庫因此有好一段時間讓未驗證信箱的學生照樣報名，畫面上完全正常。
// 下面第一個 case 就是那個 regression：在未套用 39 的資料庫上它必須是紅燈。

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  callExpectError,
  connect,
  createSession,
  createStaff,
  createVolunteer,
} from "./helpers";

let client: pg.Client;
let staffId: string;

const REGISTER = "SELECT public.rpc_register_for_session($1)";

beforeAll(async () => {
  client = await connect();
  staffId = await createStaff(client);
}, 30_000);

afterAll(async () => {
  await client?.end();
});

describe("rpc_register_for_session 資格守衛", () => {
  it("Email 未驗證 → 擋下（21 加的關卡，34 曾把它洗掉）", async () => {
    const volunteerId = await createVolunteer(client, staffId, {
      emailVerified: false,
    });
    const { sessionId } = await createSession(client, staffId);

    const err = await callExpectError(client, volunteerId, REGISTER, [sessionId]);
    expect(err).toMatch(/Email 驗證/);
  });

  it("Email 已驗證且狀態正常 → 報名成功", async () => {
    const volunteerId = await createVolunteer(client, staffId);
    const { sessionId } = await createSession(client, staffId);

    const err = await callExpectError(client, volunteerId, REGISTER, [sessionId]);
    expect(err).toBeNull();
  });

  it("已封存（deleted_at 有值但 status 仍為 active）→ 擋下", async () => {
    const volunteerId = await createVolunteer(client, staffId, { archived: true });
    const { sessionId } = await createSession(client, staffId);

    const err = await callExpectError(client, volunteerId, REGISTER, [sessionId]);
    expect(err).toMatch(/帳號狀態無法報名/);
  });

  it("黑名單期間 → 擋下", async () => {
    const volunteerId = await createVolunteer(client, staffId, { blacklisted: true });
    const { sessionId } = await createSession(client, staffId);

    const err = await callExpectError(client, volunteerId, REGISTER, [sessionId]);
    expect(err).toMatch(/帳號狀態無法報名/);
  });

  it("待審核帳號 → 擋下", async () => {
    const volunteerId = await createVolunteer(client, staffId, {
      status: "pending_review",
    });
    const { sessionId } = await createSession(client, staffId);

    const err = await callExpectError(client, volunteerId, REGISTER, [sessionId]);
    expect(err).toMatch(/帳號狀態無法報名/);
  });

  it("場次額滿 → 擋下", async () => {
    const { sessionId } = await createSession(client, staffId, { capacity: 1 });
    const first = await createVolunteer(client, staffId);
    const second = await createVolunteer(client, staffId);

    expect(await callExpectError(client, first, REGISTER, [sessionId])).toBeNull();
    const err = await callExpectError(client, second, REGISTER, [sessionId]);
    expect(err).toMatch(/名額已滿/);
  });

  it("時間衝突 → 擋下", async () => {
    const volunteerId = await createVolunteer(client, staffId);
    const a = await createSession(client, staffId, { startsInHours: 72 });
    const b = await createSession(client, staffId, { startsInHours: 72 });

    expect(await callExpectError(client, volunteerId, REGISTER, [a.sessionId])).toBeNull();
    const err = await callExpectError(client, volunteerId, REGISTER, [b.sessionId]);
    expect(err).toMatch(/時間衝突/);
  });

  it("活動未開放報名（draft）→ 擋下", async () => {
    const volunteerId = await createVolunteer(client, staffId);
    const { sessionId } = await createSession(client, staffId, {
      activityStatus: "draft",
    });

    const err = await callExpectError(client, volunteerId, REGISTER, [sessionId]);
    expect(err).toMatch(/活動未開放報名/);
  });

  it("兩人同時搶最後一格 → 只有一人成功", async () => {
    const { sessionId } = await createSession(client, staffId, { capacity: 1 });
    const a = await createVolunteer(client, staffId);
    const b = await createVolunteer(client, staffId);

    // 各自獨立連線才會真的併發；共用一條連線只會被序列化，測不到鎖。
    const [ca, cb] = await Promise.all([connect(), connect()]);
    try {
      const results = await Promise.all([
        callExpectError(ca, a, REGISTER, [sessionId]),
        callExpectError(cb, b, REGISTER, [sessionId]),
      ]);
      const succeeded = results.filter((r) => r === null);
      expect(succeeded).toHaveLength(1);
    } finally {
      await Promise.all([ca.end(), cb.end()]);
    }
  });
});

describe("fn_fill_hours_on_attendance 時數下限", () => {
  it("極短場次出席 → service_hours 不得為 0（16 的下限，31 曾把它洗掉）", async () => {
    const volunteerId = await createVolunteer(client, staffId);
    // 10 秒場次：round(10/3600, 2) = 0.00，會違反 service_hours > 0 的 CHECK
    const { sessionId } = await createSession(client, staffId, {
      durationSeconds: 10,
    });

    await callExpectError(client, volunteerId, REGISTER, [sessionId]);
    await client.query(
      `UPDATE public.registrations SET status = 'approved'
        WHERE activity_session_id = $1 AND volunteer_id = $2`,
      [sessionId, volunteerId]
    );

    // 直接標記出席即觸發 fill_hours trigger；下限沒了的話這句會因 CHECK 而失敗。
    await expect(
      client.query(
        `UPDATE public.registrations SET attendance = 'attended', checked_in_at = now()
          WHERE activity_session_id = $1 AND volunteer_id = $2`,
        [sessionId, volunteerId]
      )
    ).resolves.toBeDefined();

    const { rows } = await client.query(
      `SELECT service_hours FROM public.registrations
        WHERE activity_session_id = $1 AND volunteer_id = $2`,
      [sessionId, volunteerId]
    );
    expect(Number(rows[0].service_hours)).toBeGreaterThan(0);
  });
});
