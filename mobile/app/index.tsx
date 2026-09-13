import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../src/store/session";
import { useTheme } from "../src/theme";
import { IS_ADMIN_BUILD, IS_DEMO_BUILD } from "../src/lib/variant";

const DEMO_OPENED_KEY = "samiksha.demoBuildOpened";

export default function Index() {
  const { loading, isAuthed, isAdmin, needsOnboarding, enterDemo } = useSession();
  const t = useTheme();
  // A demo build opens straight into its journey the first time. After that,
  // signing out lands on the sign-in screen, exactly as the browser demo does.
  const [demoCheck, setDemoCheck] = useState(IS_DEMO_BUILD);

  useEffect(() => {
    if (!IS_DEMO_BUILD || loading) return;
    if (isAuthed) { setDemoCheck(false); return; }
    (async () => {
      const opened = await AsyncStorage.getItem(DEMO_OPENED_KEY).catch(() => "1");
      if (!opened) {
        await AsyncStorage.setItem(DEMO_OPENED_KEY, "1").catch(() => {});
        await enterDemo(IS_ADMIN_BUILD);
      }
      setDemoCheck(false);
    })();
  }, [loading, isAuthed, enterDemo]);

  if (loading || (demoCheck && !isAuthed)) {
    return (
      <View style={{ flex: 1, backgroundColor: t.color.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={t.color.primary} />
      </View>
    );
  }
  if (!isAuthed) return <Redirect href="/(auth)/sign-in" />;

  // Administrators get a different application, not a different tab. The two
  // audiences share almost no questions: an officer asks what to study next,
  // an administrator asks where four thousand officers are collectively weak.
  if (isAdmin) return <Redirect href="/(admin)" />;

  // A profile without measured competencies cannot produce a defensible
  // recommendation, so onboarding is not skippable on first run.
  if (needsOnboarding) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
