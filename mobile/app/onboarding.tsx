/**
 * Onboarding — one screen, two taps.
 *
 * An administrator already provisioned this account against an employee ID,
 * with the officer's department and years of service, so asking for them again
 * only slows the first minute down. What is left to confirm is the role the
 * officer is measured against and how much time they can give each day.
 *
 * Self-rating used to live here. It is the least reliable evidence there is —
 * people systematically misjudge their own skill — so the profile now starts
 * from role defaults and the optional five-minute check replaces guesswork
 * with measurement.
 */
import React, { useMemo, useState } from "react";
import { View, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius } from "../src/theme";
import { Txt, Row, Button } from "../src/components/ui";
import { useSession } from "../src/store/session";

const ROLES = [
  { code: "FI", name: "Field Investigator" },
  { code: "JSO", name: "Junior Statistical Officer" },
  { code: "SSO", name: "Senior Statistical Officer" },
  { code: "ASD", name: "Assistant Director" },
  { code: "DD", name: "Deputy Director" },
  { code: "DIR", name: "Director" },
];

const GOALS = [10, 20, 30, 45];

/** Match the provisioned designation to a role so most officers just confirm. */
function roleFromDesignation(designation?: string | null): string | null {
  const d = (designation ?? "").toLowerCase();
  if (!d) return null;
  if (d.includes("field")) return "FI";
  if (d.includes("junior")) return "JSO";
  if (d.includes("senior")) return "SSO";
  if (d.includes("assistant director")) return "ASD";
  if (d.includes("deputy director")) return "DD";
  if (d.includes("director")) return "DIR";
  return null;
}

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const { updateProfile, profile } = useSession();

  const [roleCode, setRoleCode] = useState<string | null>(() => roleFromDesignation(profile?.designation));
  const [goal, setGoal] = useState(20);
  const [busy, setBusy] = useState<"check" | "skip" | null>(null);

  const firstName = profile?.full_name?.split(" ")[0];
  const role = useMemo(() => ROLES.find((r) => r.code === roleCode), [roleCode]);

  const finish = async (thenCheck: boolean) => {
    setBusy(thenCheck ? "check" : "skip");
    await updateProfile({
      designation: profile?.designation || role?.name || null,
      daily_goal_minutes: goal,
      onboarded_at: new Date().toISOString(),
    });
    router.replace("/(tabs)");
    if (thenCheck) router.push("/assessment");
  };

  const pick = (fn: () => void) => { Haptics.selectionAsync().catch(() => {}); fn(); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.base, paddingTop: space.xl, paddingBottom: 190 }}
                  showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(320)}>
          <Txt variant="overline" tone="muted">WELCOME TO SAMIKSHA</Txt>
          <Txt variant="h1" style={{ marginTop: 6 }}>{firstName ? `Hello, ${firstName}` : "Hello"}</Txt>
          <Txt variant="body" tone="muted" style={{ marginTop: space.sm, lineHeight: 23 }}>
            Two quick choices and your plan is ready.
          </Txt>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(320)}>
          <Txt variant="overline" tone="muted" style={{ marginTop: space.xl, marginBottom: space.sm }}>
            YOUR ROLE
          </Txt>
          <Row gap={space.sm} wrap>
            {ROLES.map((r) => {
              const sel = roleCode === r.code;
              return (
                <Pressable
                  key={r.code}
                  onPress={() => pick(() => setRoleCode(r.code))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  style={{
                    paddingVertical: space.md, paddingHorizontal: space.base, borderRadius: radius.pill,
                    backgroundColor: sel ? t.color.bgInverse : t.color.bgSunken,
                    borderWidth: StyleSheet.hairlineWidth, borderColor: sel ? t.color.text : t.color.border,
                  }}
                >
                  <Txt variant="small" style={{ color: sel ? t.color.textInverse : t.color.text, fontWeight: "600" }}>
                    {r.name}
                  </Txt>
                </Pressable>
              );
            })}
          </Row>
          {profile?.designation ? (
            <Txt variant="caption" tone="subtle" style={{ marginTop: space.sm }}>
              From your service record: {profile.designation}
            </Txt>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(320)}>
          <Txt variant="overline" tone="muted" style={{ marginTop: space.xl, marginBottom: space.sm }}>
            TIME EACH DAY
          </Txt>
          <Row gap={space.sm}>
            {GOALS.map((m) => {
              const sel = goal === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => pick(() => setGoal(m))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${m} minutes a day`}
                  style={{
                    flex: 1, paddingVertical: space.base, borderRadius: radius.md, alignItems: "center",
                    backgroundColor: sel ? t.color.bgInverse : t.color.bgSunken,
                    borderWidth: StyleSheet.hairlineWidth, borderColor: sel ? t.color.text : t.color.border,
                  }}
                >
                  <Txt variant="h3" style={{ color: sel ? t.color.textInverse : t.color.text }}>{m}</Txt>
                  <Txt variant="overline" style={{ color: sel ? t.color.textInverse : t.color.textSubtle }}>MIN</Txt>
                </Pressable>
              );
            })}
          </Row>
          <Txt variant="caption" tone="subtle" style={{ marginTop: space.sm }}>
            A little every day beats a long session once a week. You can change this later.
          </Txt>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(320)}>
          <View style={{
            marginTop: space.xl, padding: space.base, borderRadius: radius.lg,
            backgroundColor: t.color.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
          }}>
            <Row gap={space.md} align="flex-start">
              <Ionicons name="flash-outline" size={20} color={t.color.text} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyMd">Optional: a 5-minute check</Txt>
                <Txt variant="small" tone="muted" style={{ marginTop: 2, lineHeight: 20 }}>
                  About ten questions that adapt to your answers, so your plan starts from what you
                  know rather than a guess. You can take it any time from Today.
                </Txt>
              </View>
            </Row>
          </View>
        </Animated.View>
      </ScrollView>

      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        backgroundColor: t.color.bgElevated,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
        paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.xxl, gap: space.sm,
      }}>
        <Button label="Take the 5-minute check" iconRight="arrow-forward" full size="lg"
                loading={busy === "check"} disabled={busy !== null} onPress={() => finish(true)} />
        <Button label="Start learning" variant="secondary" full size="lg"
                loading={busy === "skip"} disabled={busy !== null} onPress={() => finish(false)} />
      </View>
    </SafeAreaView>
  );
}
