/**
 * One codebase, two installable apps.
 *
 * A nodal officer and a learning officer use the same platform but not the same
 * product, and at a department rollout "which icon do I tap" should not depend
 * on remembering which role your account carries. The variant is chosen at build
 * time: it changes the identity of the artifact (name, package, icon) and which
 * shell the app opens into, while every screen, the theme and the data layer
 * stay shared. Nothing about the security boundary rests on this — the server
 * still decides what a given account may read, so installing the admin build
 * does not make anyone an administrator.
 *
 *   EXPO_PUBLIC_APP_VARIANT=learner  (default)  → Samiksha
 *   EXPO_PUBLIC_APP_VARIANT=admin               → Samiksha Admin
 */
const VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT === "admin" ? "admin" : "learner";
const isAdmin = VARIANT === "admin";

// Monochrome throughout. The splash and adaptive-icon backgrounds are the first
// and last thing a user sees, so a stray brand colour here undoes the palette
// everywhere else.
const INK = "#000000";

module.exports = {
  expo: {
    name: isAdmin ? "Samiksha Admin" : "Samiksha",
    slug: isAdmin ? "samiksha-admin" : "samiksha",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: isAdmin ? "samiksha-admin" : "samiksha",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: INK,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: isAdmin ? "in.gov.mospi.samiksha.admin" : "in.gov.mospi.samiksha",
    },
    android: {
      // Distinct package ids so both builds can sit on one device during a
      // demo without the installer treating the second as an upgrade.
      package: isAdmin ? "in.gov.mospi.samiksha.admin" : "in.gov.mospi.samiksha",
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: INK,
        foregroundImage: "./assets/android-icon-foreground.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      edgeToEdgeEnabled: true,
      permissions: [
        "android.permission.INTERNET",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.CAMERA",
        "android.permission.VIBRATE",
        "android.permission.RECORD_AUDIO",
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
      output: "single",
    },
    plugins: [
      "expo-router",
      "expo-status-bar",
      "expo-splash-screen",
      "expo-image",
      "expo-font",
      "expo-secure-store",
      "expo-web-browser",
      ["expo-document-picker", { iCloudContainerEnvironment: "Production" }],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Samiksha needs photo access so you can turn printed notes and handouts into quizzes.",
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      appVariant: VARIANT,
      // Read through expo-constants when the APK was built with values baked in.
      EXPO_PUBLIC_WORKSPACE_URL: process.env.EXPO_PUBLIC_WORKSPACE_URL,
    },
  },
};
