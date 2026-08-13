// DB 整合測試的共用工具：連線、建測試資料、以特定使用者身分呼叫 RPC。
//
// 測試對象是「真的跑在 Postgres 上的 RPC 與 trigger」，不是 mock——本專案的權限與
// 業務規則幾乎都在資料庫端（SECURITY DEFINER RPC + RLS），在應用層 mock 等於什麼都沒測到。

import pg from "pg";
import { randomUUID } from "node:crypto";

export const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function connect() {
  const client = new pg.Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  return client;
}

type Client = pg.Client;

/**
 * 以某位使用者的身分執行——把 PostgREST 每請求會設定的 GUC 手動設起來，
 * auth.uid() 讀的就是這個值（SECURITY DEFINER 函式也一樣讀得到）。
 * 用 SET LOCAL 包在交易裡，結束即還原，不影響後續測試。
 */
export async function asUser<T>(
  client: Client,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT set_config('request.jwt.claims',
                         json_build_object('sub', $1::text, 'role', 'authenticated')::text,
                         true)`,
      [userId]
    );
    await client.query("SET LOCAL ROLE authenticated");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

/** 呼叫 RPC 並回傳「錯誤訊息或 null」，讓測試直接斷言守衛是否擋下。 */
export async function callExpectError(
  client: Client,
  userId: string,
  sql: string,
  params: unknown[] = []
): Promise<string | null> {
  try {
    await asUser(client, userId, () => client.query(sql, params));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function createAuthUser(client: Client, email: string): Promise<string> {
  const id = randomUUID();
  // 直接寫 auth.users：測試環境以 postgres 超級使用者連線，不經 Admin API。
  await client.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email,
                             encrypted_password, email_confirmed_at,
                             created_at, updated_at)
     VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', $2, '', now(), now(), now())`,
    [id, email]
  );
  return id;
}

let seq = 0;
const uniq = () => `${Date.now()}${seq++}`;

export async function createStaff(client: Client): Promise<string> {
  const n = uniq();
  const id = await createAuthUser(client, `staff${n}@test.local`);
  await client.query(
    `INSERT INTO public.staff_profiles
       (id, full_name, email, username, phone, role, job_title, status)
     VALUES ($1, '測試社工', $2, $3, '0912345678', 'system_admin', 'social_worker', 'active')`,
    [id, `staff${n}@test.local`, `staff${n}`]
  );
  return id;
}

export interface VolunteerOpts {
  emailVerified?: boolean;
  status?: "active" | "pending_review" | "suspended" | "graduated";
  archived?: boolean;
  blacklisted?: boolean;
}

export async function createVolunteer(
  client: Client,
  workerId: string,
  opts: VolunteerOpts = {}
): Promise<string> {
  const {
    emailVerified = true,
    status = "active",
    archived = false,
    blacklisted = false,
  } = opts;

  const n = uniq();
  const id = await createAuthUser(client, `vol${n}@test.local`);
  await client.query(
    `INSERT INTO public.volunteer_profiles
       (id, full_name, birth_date, email, username, phone, grade, status, assigned_worker_id)
     VALUES ($1, '測試學生', '2005-01-01', $2, $3, '0987654321',
             'senior_high', $4, $5)`,
    [id, `vol${n}@test.local`, `vol${n}`, status, workerId]
  );

  if (emailVerified) {
    await client.query(
      `UPDATE public.volunteer_profiles SET email_verified_at = now() WHERE id = $1`,
      [id]
    );
  }
  if (archived) {
    // 封存只寫 deleted_at，status 仍是 'active'——這正是 34 要擋的情境。
    await client.query(
      `UPDATE public.volunteer_profiles SET deleted_at = now() WHERE id = $1`,
      [id]
    );
  }
  if (blacklisted) {
    // is_manual = true 才可省略 registration_id（見 01 的 blacklist_auto_requires_registration）。
    // is_blacklisted 是唯讀鏡像，由 02 的 fn_sync_is_blacklisted trigger 依本表維護。
    await client.query(
      `INSERT INTO public.blacklist_events
         (volunteer_id, expected_release_at, is_manual, note)
       VALUES ($1, now() + interval '30 days', true, '測試')`,
      [id]
    );
  }
  return id;
}

export interface SessionOpts {
  capacity?: number;
  startsInHours?: number;
  durationSeconds?: number;
  activityStatus?: "draft" | "open" | "closed" | "completed" | "cancelled";
}

export async function createSession(
  client: Client,
  staffId: string,
  opts: SessionOpts = {}
): Promise<{ activityId: string; sessionId: string }> {
  const {
    capacity = 10,
    startsInHours = 48,
    durationSeconds = 7200,
    activityStatus = "open",
  } = opts;

  const { rows: aRows } = await client.query(
    `INSERT INTO public.activities (created_by, title, location, status)
     VALUES ($1, '測試活動', '宜蘭', $2) RETURNING id`,
    [staffId, activityStatus]
  );
  const activityId = aRows[0].id as string;

  const { rows: sRows } = await client.query(
    `INSERT INTO public.activity_sessions
       (activity_id, start_at, end_at, capacity, registration_deadline_at)
     VALUES ($1,
             now() + make_interval(hours => $2::int),
             now() + make_interval(hours => $2::int) + make_interval(secs => $3::int),
             $4,
             now() + make_interval(hours => $2::int))
     RETURNING id`,
    [activityId, startsInHours, durationSeconds, capacity]
  );

  return { activityId, sessionId: sRows[0].id as string };
}
