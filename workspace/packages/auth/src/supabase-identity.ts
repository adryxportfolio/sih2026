import type { PrismaClient } from "@samiksha/db";
import { hashPassword } from "better-auth/crypto";

/**
 * Samiksha has one source of truth for who an officer is: the Supabase project
 * the mobile app authenticates against. Administrators provision every account
 * there against a verified employee ID, and officers cannot self-register.
 *
 * The workspace keeps its own user rows because sessions, spaces and bots are
 * all foreign-keyed to them. Rather than run a second, divergent credential
 * store, every sign-in is proved against Supabase first and the local row is
 * then reconciled to match. The local password hash is a cache of a decision
 * Supabase already made, never an independent authority — so an administrator
 * resetting a password in the mobile app takes effect here on the next sign-in.
 */

export interface SupabaseIdentityConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseIdentity {
  id: string;
  email: string;
  fullName: string;
}

export function supabaseIdentityFromEnv(source: {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}): SupabaseIdentityConfig | undefined {
  const url = source.SUPABASE_URL?.trim();
  const anonKey = source.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return undefined;
  return { url: url.replace(/\/+$/, ""), anonKey };
}

/**
 * Exchange officer credentials for a Supabase identity.
 *
 * Returns undefined for any credential Supabase rejects — including accounts an
 * administrator has deactivated, which Supabase refuses at the token endpoint.
 * Throws only when Supabase itself is unreachable, so a network fault surfaces
 * as an outage rather than silently reading as "wrong password".
 */
export async function verifySupabaseCredentials(
  config: SupabaseIdentityConfig,
  email: string,
  password: string,
): Promise<SupabaseIdentity | undefined> {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (response.status === 400 || response.status === 401) return undefined;
  if (!response.ok) {
    throw new Error(`Supabase identity check failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    user?: {
      id?: string;
      email?: string;
      user_metadata?: { full_name?: string; employee_id?: string };
    };
  };
  const user = payload.user;
  if (!user?.id || !user.email) return undefined;

  return {
    id: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name?.trim() || user.email.split("@")[0]!,
  };
}

/**
 * Reconcile the local user row with the Supabase identity that just proved
 * itself, and cache the verified password so Better Auth's own credential check
 * — which runs immediately after this — succeeds.
 *
 * The Supabase auth UUID is reused as the local user id on purpose: it keeps a
 * single identifier across the mobile app, the workspace and the competency
 * tables, so an agent can look up whose gaps it is working against without a
 * mapping table.
 */
export async function reconcileLocalIdentity(
  prisma: PrismaClient,
  identity: SupabaseIdentity,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);

  const existing = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });

  const userId = existing?.id ?? identity.id;

  if (existing) {
    await prisma.user.update({
      where: { id: userId },
      // Administrators can rename an officer in the mobile app; carry that over.
      // emailVerified is always true: an admin handing over credentials in
      // person is the verification step, so there is no confirmation email.
      data: { name: identity.fullName, emailVerified: true },
    });
  } else {
    await prisma.user.create({
      data: {
        id: userId,
        email: identity.email,
        name: identity.fullName,
        emailVerified: true,
      },
    });
  }

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });

  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { password: passwordHash },
    });
  } else {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      },
    });
  }
}
