import Constants from "expo-constants";

/**
 * Which of the two builds this binary is.
 *
 * The variant is cosmetic and navigational only. It picks the app's name, icon
 * and which demo the sign-in screen leads with — it never grants access. A real
 * account's role comes from the server on every request, so an officer who
 * installs the administrator build still gets the officer experience, and
 * nobody becomes an administrator by choosing a different APK.
 */
export type AppVariant = "learner" | "admin" | "demo" | "demo-admin";

const VARIANTS: AppVariant[] = ["learner", "admin", "demo", "demo-admin"];
const fromEnv = process.env.EXPO_PUBLIC_APP_VARIANT as AppVariant | undefined;
const fromConfig = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.appVariant as AppVariant | undefined;

export const APP_VARIANT: AppVariant =
  fromConfig && VARIANTS.includes(fromConfig) ? fromConfig
  : fromEnv && VARIANTS.includes(fromEnv) ? fromEnv
  : "learner";

export const IS_ADMIN_BUILD = APP_VARIANT === "admin" || APP_VARIANT === "demo-admin";

/** Demo builds open straight into seeded data — no account needed. */
export const IS_DEMO_BUILD = APP_VARIANT === "demo" || APP_VARIANT === "demo-admin";
