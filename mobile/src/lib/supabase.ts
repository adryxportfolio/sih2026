import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

/**
 * Env resolution.
 *
 * EXPO_PUBLIC_* values are inlined at build time, but only where the code names
 * them literally — `process.env.EXPO_PUBLIC_SUPABASE_URL`. A computed lookup
 * such as `process.env[key]` works in the browser dev server, which exposes the
 * whole environment, and silently yields undefined in a release APK. That is how
 * the v1.0–v1.2 APKs shipped unable to reach Supabase. The app config's `extra`
 * carries the same values as a second route.
 */
// deno-lint-ignore no-explicit-any
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;

const supabaseUrl: string | undefined =
  process.env.EXPO_PUBLIC_SUPABASE_URL || extra.EXPO_PUBLIC_SUPABASE_URL || undefined;
const supabaseAnonKey: string | undefined =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.\n" +
    "Copy .env.example to .env at the repo root and run `npm run env:sync`.",
  );
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar, so there is no callback fragment to read.
      detectSessionInUrl: false,
    },
  },
);

export const SUPABASE_URL = supabaseUrl ?? "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
