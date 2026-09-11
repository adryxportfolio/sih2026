import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../src/store/session";
import { useTheme } from "../src/theme";

export default function Index() {
  const { loading, isAuthed } = useSession();
  const t = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.color.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={t.color.primary} />
      </View>
    );
  }
  return <Redirect href={isAuthed ? "/(tabs)" : "/(auth)/sign-in"} />;
}
