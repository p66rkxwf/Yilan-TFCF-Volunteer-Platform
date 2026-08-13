// 站內通知不得外洩 Email OTP。
//
// 原本的漏洞：rpc_request_email_otp 把 6 碼明碼塞進 notification_outbox.payload 供
// worker 寄信，而 15_notification_center.sql 又把同一張表開放給 authenticated 讀
// 自己的列——OTP 那列的收件者正是本人。於是「證明你擁有這個信箱」變成
// 「登入後查一下自己的通知列」，Email 驗證完全失去意義。
//
// 這裡驗證三道防線都在：碼不進 payload、基表讀不到、視圖排除驗證信。

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { asUser, connect, createStaff, createVolunteer } from "./helpers";

let client: pg.Client;
let staffId: string;
let volunteerId: string;

beforeAll(async () => {
  client = await connect();
  staffId = await createStaff(client);
  // OTP 只發給「尚未驗證」的在職學生
  volunteerId = await createVolunteer(client, staffId, { emailVerified: false });
  await asUser(client, volunteerId, () =>
    client.query("SELECT public.rpc_request_email_otp()")
  );
}, 30_000);

afterAll(async () => {
  await client?.end();
});

describe("Email OTP 外洩防線", () => {
  it("驗證碼有產生（存在 email_verifications，僅 service_role 可見）", async () => {
    const { rows } = await client.query(
      `SELECT code FROM public.email_verifications WHERE volunteer_id = $1`,
      [volunteerId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toMatch(/^\d{6}$/);
  });

  it("outbox payload 不含 code", async () => {
    const { rows } = await client.query(
      `SELECT payload FROM public.notification_outbox
        WHERE recipient_user_id = $1 AND notification_type = 'email_verification'`,
      [volunteerId]
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.payload).not.toHaveProperty("code");
    }
  });

  it("authenticated 讀不到 notification_outbox 基表", async () => {
    await expect(
      asUser(client, volunteerId, () =>
        client.query("SELECT * FROM public.notification_outbox")
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it("v_my_notifications 不含 email_verification", async () => {
    const rows = await asUser(client, volunteerId, async () => {
      const r = await client.query(
        `SELECT notification_type FROM public.v_my_notifications`
      );
      return r.rows;
    });
    expect(rows.every((r) => r.notification_type !== "email_verification")).toBe(true);
  });

  it("v_my_notifications 只看得到自己的通知", async () => {
    const other = await createVolunteer(client, staffId);
    await client.query(
      `INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload)
       VALUES ($1, 'account_review_result', '{}'::jsonb)`,
      [other]
    );

    const rows = await asUser(client, volunteerId, async () => {
      const r = await client.query(`SELECT id FROM public.v_my_notifications`);
      return r.rows;
    });

    const { rows: mine } = await client.query(
      `SELECT id FROM public.notification_outbox
        WHERE recipient_user_id = $1 AND deleted_at IS NULL
          AND notification_type <> 'email_verification'`,
      [volunteerId]
    );
    expect(rows.map((r) => r.id).sort()).toEqual(mine.map((r) => r.id).sort());
  });
});
