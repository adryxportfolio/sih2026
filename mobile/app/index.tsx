import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../src/store/session";
import { useTheme } from "../src/theme";

export default function Index() {
  const { loading, isAuthed, isAdmin, needsOnboarding } = useSession();
  const t = useTheme();

  if (loading) {
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
