import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

/**
 * Env resolution: EXPO_PUBLIC_* vars are inlined at build time, but reading
 * through expo-constants as a fallback keeps things working when the app is
 * launched from a prebuilt binary with runtime config.
 */
function env(key: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
  return process.env[key] ?? extra[key];
}

const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = env("EXPO_PUBLIC_SUPABASE_ANON_KEY");

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
