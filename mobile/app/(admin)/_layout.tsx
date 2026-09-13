/**
 * Administrator application.
 *
 * A separate tab navigator, not a screen bolted onto the learner app. The two
 * audiences have almost nothing in common: an officer wants to know what to
 * study next, an administrator wants to know where four thousand officers are
 * collectively weak and whether the training they commissioned is working.
 * Forcing both into one information architecture serves neither.
 *
 * Both ship in one APK and the role decides which one opens, so a nodal
 * officer who is also a learner does not need a second install.
 */
import React, { useMemo } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import { View, Platform, StyleSheet, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type as typo } from "../../src/theme";
import { FloatingMascot, type MascotTip } from "../../src/components/FloatingMascot";

export default function AdminLayout() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const tip = useMemo<MascotTip | null>(() => {
    if (pathname.includes("officers")) {
      return { text: "Four officers have critical gaps in Data Privacy. Want the DPDP cohort list?", cta: "Show me",
               prompt: "Which officers have critical gaps, and in which competencies?" };
    }
    if (pathname.includes("materials")) {
      return { text: "I can tell you who has opened what you published — or publish a link for you.", cta: "Ask me",
               prompt: "Which study materials have been published, and how many officers have opened each?" };
    }
    if (pathname.includes("live")) {
      return { text: "Want a quick read on who is studying right now and who has gone quiet?", cta: "Ask about it",
               prompt: "Who is studying right now, and who has gone quiet this week?" };
    }
    return null;
  }, [pathname]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.color.primary,
          tabBarInactiveTintColor: t.color.textSubtle,
          tabBarStyle: {
            backgroundColor: t.color.bgElevated,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: t.color.border,
            height: Platform.OS === "ios" ? 86 : 64,
            paddingBottom: Platform.OS === "ios" ? 28 : 8,
            paddingTop: 8,
            elevation: 8,
          },
          tabBarLabelStyle: { ...typo.overline, fontSize: 10, marginTop: 2 },
        }}
      >
        <Tabs.Screen name="index" options={{
          title: "OVERVIEW",
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name={focused ? "stats-chart" : "stats-chart-outline"} color={color} focused={focused} />
          ),
        }} />
        <Tabs.Screen name="officers" options={{
          title: "OFFICERS",
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name={focused ? "people" : "people-outline"} color={color} focused={focused} />
          ),
        }} />
        <Tabs.Screen name="materials" options={{
          title: "MATERIALS",
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name={focused ? "library" : "library-outline"} color={color} focused={focused} />
          ),
        }} />
        <Tabs.Screen name="live" options={{
          title: "LIVE",
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name={focused ? "radio" : "radio-outline"} color={color} focused={focused} />
          ),
        }} />
        <Tabs.Screen name="settings" options={{
          title: "SETTINGS",
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name={focused ? "settings" : "settings-outline"} color={color} focused={focused} />
          ),
        }} />
        {/* Drill-down lives inside the tab stack but has no tab of its own. */}
        <Tabs.Screen name="officer/[id]" options={{ href: null }} />
      </Tabs>

      <FloatingMascot
        tip={tip}
        // For an administrator Samiksha AI is an operator: it answers from the
        // platform's data and carries out tasks once they confirm them.
        menu={[
          { icon: "sparkles", label: "Ask Samiksha AI",
            hint: "Get data or hand over a task", onPress: () => router.push("/assistant") },
          { icon: "hardware-chip-outline", label: "Go to workspace",
            hint: "Your agent team", onPress: () => router.push("/workspace") },
        ]}
        onPress={() => router.push(tip?.prompt
          ? { pathname: "/assistant", params: { prompt: tip.prompt } }
          : "/assistant")}
        bottom={Platform.OS === "ios" ? 104 : 84}
      />
    </View>
  );
}

function AdminTabIcon({
  name, color, focused,
}: { name: keyof typeof Ionicons.glyphMap; color: ColorValue; focused: boolean }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      {focused ? (
        <View style={{
          position: "absolute", top: -8, width: 26, height: 3,
          borderRadius: 2, backgroundColor: t.color.primary,
        }} />
      ) : null}
      <Ionicons name={name} size={22} color={color as string} />
    </View>
  );
}
