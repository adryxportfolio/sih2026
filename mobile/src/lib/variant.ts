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
export type AppVariant = "learner" | "admin";

export const APP_VARIANT: AppVariant =
  ((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.appVariant as AppVariant) ??
  (process.env.EXPO_PUBLIC_APP_VARIANT === "admin" ? "admin" : "learner");

export const IS_ADMIN_BUILD = APP_VARIANT === "admin";
