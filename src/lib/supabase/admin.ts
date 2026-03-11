import { createClient } from "@supabase/supabase-js";

let adminClient: ReturnType<typeof createClient> | undefined;

export function createAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  return adminClient;
}
