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
export type AppVariant = "learner" | "admin" | "demo";

const fromEnv = process.env.EXPO_PUBLIC_APP_VARIANT;

export const APP_VARIANT: AppVariant =
  ((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.appVariant as AppVariant) ??
  (fromEnv === "admin" || fromEnv === "demo" ? fromEnv : "learner");

export const IS_ADMIN_BUILD = APP_VARIANT === "admin";

/** The demo build opens on a choice of journeys over seeded data — no account needed. */
export const IS_DEMO_BUILD = APP_VARIANT === "demo";
