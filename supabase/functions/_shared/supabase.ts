import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Admin client — bypasses RLS. Use ONLY for trusted server-side writes
 * (audit logs, catalogue upserts). Never derive user identity from input.
 */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Client scoped to the caller's JWT. All RLS policies apply, so this is what
 * we use for anything touching user-owned rows.
 */
export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Resolve and verify the calling user. Throws if the JWT is absent/invalid. */
export async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const supabase = userClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return { id: data.user.id, email: data.user.email ?? undefined };
}
