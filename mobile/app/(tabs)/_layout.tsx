import React, { useMemo } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import { View, Platform, StyleSheet, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type as typo } from "../../src/theme";
import { FloatingMascot, type MascotTip } from "../../src/components/FloatingMascot";

export default function TabsLayout() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  // The mascot says something relevant to where you are, not a generic
  // "Hi, how can I help?" — an assistant that never has context gets ignored.
  const tip = useMemo<MascotTip | null>(() => {
    if (pathname.includes("insights")) {
      return { text: "Your sampling gap is the one that would actually change a published estimate. Want me to explain design weights?", cta: "Explain it",
               prompt: "Explain design weights in a two-stage sample with a small worked example." };
    }
    if (pathname.includes("path")) {
      return { text: "Notice sampling appears three times, spread across six weeks? That spacing is deliberate — ask me why.", cta: "Ask why",
               prompt: "Why does my plan space the same topic out over several weeks instead of back to back?" };
    }
    if (pathname.includes("library")) {
      return { text: "Material from your department appears here. Ask me about any of it.", cta: "How it works",
               prompt: "How can you help me with the study material my department assigned?" };
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
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "TODAY",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="path"
        options={{
          title: "MY PLAN",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "map" : "map-outline"} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "LIBRARY",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "library" : "library-outline"} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "INSIGHTS",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "stats-chart" : "stats-chart-outline"} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "person-circle" : "person-circle-outline"} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>

      <FloatingMascot
        tip={tip}
        // Two different requests, one mascot: "help me understand this" goes to
        // Samiksha AI, "do this for me" goes to the agent workspace.
        menu={[
          { icon: "chatbubble-ellipses", label: "Ask a question",
            hint: "Clear a doubt with Samiksha AI", onPress: () => router.push("/assistant") },
          { icon: "hardware-chip-outline", label: "Go to workspace",
            hint: "Delegate work to your agents", onPress: () => router.push("/workspace") },
        ]}
        onPress={() => router.push(tip?.prompt
          ? { pathname: "/assistant", params: { prompt: tip.prompt } }
          : "/assistant")}
        bottom={Platform.OS === "ios" ? 104 : 84}
      />
    </View>
  );
}

function TabIcon({
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
