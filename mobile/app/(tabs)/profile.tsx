import React from "react";
import { View, Alert, Switch, Linking } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, SectionHeader, Divider, StatTile, useOnInverse,
} from "../../src/components/ui";
import { useSession } from "../../src/store/session";
import { DEMO_USER, DEMO_COMPETENCIES } from "../../src/lib/demo";

export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const { profile, signOut, isDemo } = useSession();
  const onInv = useOnInverse();

  const initials = (profile?.full_name ?? "Officer")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const doSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign in again to continue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: async () => {
        await signOut(); router.replace("/(auth)/sign-in");
      } },
    ]);
  };

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(360)}>
        <View style={{
          borderRadius: radius.xl, padding: space.lg, marginTop: space.sm,
          backgroundColor: t.color.bgInverse,
        }}>
          <Row gap={space.base}>
            <View style={{
              width: 62, height: 62, borderRadius: 31,
              backgroundColor: onInv.fill,
              alignItems: "center", justifyContent: "center",
              borderWidth: 1.5, borderColor: onInv.hairline,
            }}>
              <Txt variant="h2" style={{ color: onInv.strong }}>{initials}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="h2" style={{ color: onInv.strong }} numberOfLines={1}>
                {profile?.full_name ?? "Officer"}
              </Txt>
              <Txt variant="small" style={{ color: onInv.muted }} numberOfLines={1}>
                {profile?.designation ?? DEMO_USER.designation}
              </Txt>
              <Txt variant="caption" style={{ color: onInv.subtle, marginTop: 3 }} numberOfLines={2}>
                {DEMO_USER.organization}
              </Txt>
            </View>
          </Row>

          <Row gap={space.sm} wrap style={{ marginTop: space.base }}>
            <View style={{
              paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.pill,
              backgroundColor: onInv.fill,
            }}>
              <Txt variant="overline" style={{ color: onInv.strong }}>
                FRAC ROLE · {DEMO_USER.job_role_code}
              </Txt>
            </View>
            <View style={{
              paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.pill,
              backgroundColor: onInv.fill,
            }}>
              <Txt variant="overline" style={{ color: onInv.strong }}>{DEMO_USER.grade_level.toUpperCase()}</Txt>
            </View>
          </Row>
        </View>
      </Animated.View>

      <Row gap={space.md} style={{ marginTop: space.base }}>
        <StatTile label="XP" value={(profile?.xp ?? 0).toLocaleString()} icon="sparkles" tone="neutral" />
        <StatTile label="Streak" value={profile?.streak_current ?? 0} sub="days" icon="flame" tone="neutral" />
        <StatTile label="Service" value={`${profile?.years_of_service ?? 4}y`} icon="briefcase" tone="neutral" />
      </Row>

      <Card level={1} onPress={() => router.push("/onboarding")} style={{ marginTop: space.base }}>
        <Row justify="space-between">
          <Row gap={space.md} style={{ flex: 1 }}>
            <Ionicons name="refresh-outline" size={18} color={t.color.textMuted} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyMd">Redo onboarding</Txt>
              <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                Update your role, posting or self-assessment
              </Txt>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={18} color={t.color.textSubtle} />
        </Row>
      </Card>

      <SectionHeader title="Learning settings" icon="options-outline" />
      <Card level={1}>
        <SettingRow icon="time-outline" label="Daily goal"
                    value={`${profile?.daily_goal_minutes ?? 25} minutes`} />
        <Divider style={{ marginVertical: space.md }} />
        <SettingRow icon="repeat-outline" label="Target retention"
                    value={`${Math.round((profile?.desired_retention ?? 0.9) * 100)}%`}
                    hint="Higher means more frequent reviews" />
        <Divider style={{ marginVertical: space.md }} />
        <SettingRow icon="language-outline" label="Language"
                    value={(profile?.preferred_language ?? "en") === "en" ? "English" : "हिन्दी"} />
      </Card>

      <SectionHeader title="Ministry view" icon="business-outline" />
      <Card level={2} onPress={() => router.push("/(admin)")}>
        <Row justify="space-between">
          <Row gap={space.md} style={{ flex: 1 }}>
            <View style={{
              width: 42, height: 42, borderRadius: radius.md,
              backgroundColor: t.color.bgInverse,
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="stats-chart" size={19} color={t.color.textInverse} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyMd">Workforce Intelligence</Txt>
              <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                Aggregate competency health for nodal officers
              </Txt>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={18} color={t.color.textSubtle} />
        </Row>
        <Txt variant="caption" tone="subtle" style={{ marginTop: space.md, lineHeight: 17 }}>
          Shown here for the demo. In production this is gated to the
          nodal_officer and admin roles by Row Level Security.
        </Txt>
      </Card>

      <SectionHeader title="Integration" icon="git-network-outline" />
      <Card level={1}>
        <Row justify="space-between">
          <Row gap={space.md} style={{ flex: 1 }}>
            <View style={{
              width: 38, height: 38, borderRadius: radius.sm,
              backgroundColor: t.color.primarySoft,
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="school-outline" size={18} color={t.color.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyMd">iGOT Karmayogi</Txt>
              <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                Course catalogue and enrolment sync
              </Txt>
            </View>
          </Row>
          <Badge label={isDemo ? "SIMULATED" : "MOCK"} tone="warning" size="sm" />
        </Row>
        <Txt variant="caption" tone="subtle" style={{ marginTop: space.md, lineHeight: 17 }}>
          iGOT has no public API. This adapter implements the real Sunbird ED contract
          and runs against a seeded catalogue until credentials are provisioned —
          switching to live is one environment flag.
        </Txt>
      </Card>

      <SectionHeader title="About" icon="information-circle-outline" />
      <Card level={1}>
        <SettingRow icon="cube-outline" label="Version" value="1.0.0" />
        <Divider style={{ marginVertical: space.md }} />
        <SettingRow icon="hardware-chip-outline" label="AI models"
                    value="DeepSeek v4 · Kimi k2.5/k2.6" />
        <Divider style={{ marginVertical: space.md }} />
        <SettingRow icon="shield-checkmark-outline" label="Problem statement" value="SIH26101" />
      </Card>

      <Button label="Sign out" variant="secondary" icon="log-out-outline" full
              onPress={doSignOut} style={{ marginTop: space.xl }} />

      <Txt variant="caption" tone="subtle" center style={{ marginTop: space.lg }}>
        Samiksha · Smart India Hackathon 2026
      </Txt>
    </Screen>
  );
}

function SettingRow({
  icon, label, value, hint,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; hint?: string }) {
  const t = useTheme();
  return (
    <Row justify="space-between" align="flex-start">
      <Row gap={space.md} style={{ flex: 1 }}>
        <Ionicons name={icon} size={17} color={t.color.textMuted} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Txt variant="body">{label}</Txt>
          {hint ? <Txt variant="caption" tone="subtle" style={{ marginTop: 2 }}>{hint}</Txt> : null}
        </View>
      </Row>
      <Txt variant="bodyMd" tone="primary">{value}</Txt>
    </Row>
  );
}
