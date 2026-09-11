import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius, type as typo, elevation } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, StatTile, SectionHeader,
  ProgressBar, LevelBadge, Divider, useOnInverse,
} from "../../src/components/ui";
import { Sparkline, GapBar } from "../../src/components/charts";
import { CountUp, Appear, GrowBar } from "../../src/components/motion";
import { useSession } from "../../src/store/session";
import {
  DEMO_COMPETENCIES, DEMO_PATH, DEMO_CARDS, DEMO_ACCURACY_TREND, demoHeatmap,
} from "../../src/lib/demo";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const t = useTheme();
  const router = useRouter();
  const { profile, isDemo } = useSession();
  const onInv = useOnInverse();

  const firstName = (profile?.full_name ?? "Officer").split(" ")[0];

  const dueCards = useMemo(() => DEMO_CARDS.filter((c) => c.due <= 0).length, []);
  const topGap = useMemo(
    () => [...DEMO_COMPETENCIES]
      .filter((c) => c.current < c.required)
      .sort((a, b) => (b.required - b.current) - (a.required - a.current))[0],
    [],
  );
  const nextStep = useMemo(
    () => DEMO_PATH.items.find((i) => i.status === "in_progress")
       ?? DEMO_PATH.items.find((i) => i.status === "pending"),
    [],
  );

  const heat = useMemo(() => demoHeatmap(), []);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMinutes = heat[todayKey] ?? 0;
  const goal = profile?.daily_goal_minutes ?? 25;
  const goalPct = Math.min(1, todayMinutes / goal);

  const gapsClosed = DEMO_COMPETENCIES.filter((c) => c.current >= c.required).length;

  return (
    <Screen>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(360)}>
        <Row justify="space-between" align="flex-start" style={{ marginTop: space.sm, marginBottom: space.lg }}>
          <View style={{ flex: 1 }}>
            <Txt variant="small" tone="muted">{greeting()},</Txt>
            <Txt variant="h1" numberOfLines={1}>{firstName}</Txt>
            <Row gap={space.sm} style={{ marginTop: 6 }}>
              <Badge label={profile?.designation ?? "Junior Statistical Officer"} tone="primary" size="sm" />
              {isDemo ? <Badge label="DEMO" tone="neutral" size="sm" icon="flask" /> : null}
            </Row>
          </View>

          <Pressable onPress={() => router.push("/(tabs)/profile")} hitSlop={8}>
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 5,
              paddingHorizontal: space.md, height: 36,
              borderRadius: radius.pill,
              backgroundColor: t.color.accentSoft,
              borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.primary + "44",
            }}>
              <Ionicons name="flame" size={15} color={t.color.primary} />
              <Txt variant="bodyMd" tone="primary">{profile?.streak_current ?? 0}</Txt>
            </View>
          </Pressable>
        </Row>
      </Animated.View>

      {/* ── Today's focus ──────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(60).duration(360)}>
        <View style={{
          borderRadius: radius.xl,
          padding: space.lg,
          backgroundColor: t.color.bgInverse,
          ...elevation(3, t.color.shadow),
        }}>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1 }}>
              <Txt variant="overline" style={{ color: onInv.muted }}>TODAY'S GOAL</Txt>
              <Row gap={6} align="flex-end" style={{ marginTop: 6 }}>
                <CountUp value={todayMinutes} variant="display" delay={150} style={{ color: onInv.strong }} />
                <Txt variant="body" style={{ color: onInv.muted, marginBottom: 6 }}>
                  / {goal} min
                </Txt>
              </Row>
            </View>
            <View style={{
              width: 46, height: 46, borderRadius: 23,
              backgroundColor: onInv.fill,
              borderWidth: 1, borderColor: onInv.hairline,
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name={goalPct >= 1 ? "checkmark" : "time-outline"} size={22} color={onInv.strong} />
            </View>
          </Row>

          <GrowBar
            value={goalPct}
            height={7}
            delay={320}
            color={onInv.strong}
            trackColor={onInv.fillStrong}
            style={{ marginTop: space.md }}
          />

          <Txt variant="small" style={{ color: onInv.muted, marginTop: space.md }}>
            {goalPct >= 1
              ? `Goal met — streak extended to ${profile?.streak_current ?? 0} days.`
              : `${Math.max(0, goal - todayMinutes)} minutes to keep your ${profile?.streak_current ?? 0}-day streak alive.`}
          </Txt>

          <Row gap={space.sm} style={{ marginTop: space.base }}>
            <Pressable
              onPress={() => router.push("/review")}
              style={{
                flex: 1, height: 46, borderRadius: radius.md,
                backgroundColor: t.color.bg, flexDirection: "row",
                alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Ionicons name="albums" size={16} color={t.color.text} />
              <Txt variant="bodyMd">Review {dueCards}</Txt>
            </Pressable>
            <Pressable
              onPress={() => router.push("/quiz/demo-quiz-01")}
              style={{
                flex: 1, height: 46, borderRadius: radius.md,
                backgroundColor: onInv.fill,
                borderWidth: 1, borderColor: onInv.hairline,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Ionicons name="help-circle" size={16} color={onInv.strong} />
              <Txt variant="bodyMd" style={{ color: onInv.strong }}>Quiz</Txt>
            </Pressable>
          </Row>
        </View>
      </Animated.View>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(120).duration(360)}>
        <Row gap={space.md} style={{ marginTop: space.base }}>
          <StatTile
            label="Due now" value={dueCards} sub="flashcards"
            icon="albums-outline" tone="neutral" delay={260}
            onPress={() => router.push("/review")}
          />
          <StatTile
            label="Gaps closed" value={`${gapsClosed}/${DEMO_COMPETENCIES.length}`} sub="competencies"
            icon="trending-up" tone="neutral" delay={340}
            onPress={() => router.push("/(tabs)/insights")}
          />
        </Row>
        <Row gap={space.md} style={{ marginTop: space.md }}>
          <StatTile label="Total XP" value={(profile?.xp ?? 0).toLocaleString()} sub="all time"
                    icon="sparkles" tone="neutral" delay={420} />
          <StatTile label="Best streak" value={profile?.streak_longest ?? 0} sub="days"
                    icon="flame" tone="neutral" delay={500} />
        </Row>
      </Animated.View>

      {/* ── Next step in plan ──────────────────────────────────────────── */}
      {nextStep ? (
        <Animated.View entering={FadeInDown.delay(180).duration(360)}>
          <SectionHeader title="Continue your plan" icon="map-outline"
                         action="See all" onAction={() => router.push("/(tabs)/path")} />
          <Card level={2} onPress={() => router.push("/(tabs)/path")}>
            <Row gap={space.md} align="flex-start">
              <View style={{
                width: 44, height: 44, borderRadius: radius.md,
                backgroundColor: t.color.primarySoft,
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons
                  name={
                    nextStep.kind === "course" ? "school"
                    : nextStep.kind === "video" ? "play-circle"
                    : nextStep.kind === "quiz" ? "help-circle"
                    : nextStep.kind === "flashcard_deck" ? "albums"
                    : "create"
                  }
                  size={21} color={t.color.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Row gap={space.sm} style={{ marginBottom: 4 }}>
                  <Badge label={nextStep.kind.replace("_", " ")} tone="primary" size="sm" />
                  <Txt variant="overline" tone="subtle">{nextStep.estimated_minutes} MIN</Txt>
                </Row>
                <Txt variant="bodyMd" numberOfLines={2}>{nextStep.title}</Txt>
                <Txt variant="small" tone="muted" numberOfLines={2} style={{ marginTop: 4 }}>
                  {nextStep.why_this}
                </Txt>
              </View>
            </Row>
            <Divider style={{ marginVertical: space.md }} />
            <Row justify="space-between">
              <Txt variant="caption" tone="subtle">
                Step {DEMO_PATH.items.indexOf(nextStep) + 1} of {DEMO_PATH.items.length}
              </Txt>
              <Row gap={4}>
                <Txt variant="caption" tone="primary">Continue</Txt>
                <Ionicons name="arrow-forward" size={13} color={t.color.primary} />
              </Row>
            </Row>
          </Card>
        </Animated.View>
      ) : null}

      {/* ── Priority gap ───────────────────────────────────────────────── */}
      {topGap ? (
        <Animated.View entering={FadeInDown.delay(240).duration(360)}>
          <SectionHeader title="Your priority gap" icon="alert-circle-outline"
                         action="Diagnose" onAction={() => router.push("/(tabs)/insights")} />
          <Card level={1} onPress={() => router.push(`/competency/${topGap.code}`)}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, marginRight: space.md }}>
                <Txt variant="bodyMd" numberOfLines={2}>{topGap.name}</Txt>
                <Txt variant="overline" tone="subtle" style={{ marginTop: 3 }}>
                  {topGap.code} · {topGap.category.toUpperCase()}
                </Txt>
              </View>
              {topGap.is_critical ? <Badge label="CRITICAL" tone="danger" size="sm" /> : null}
            </Row>

            <View style={{ marginTop: space.base }}>
              <Row justify="space-between" style={{ marginBottom: 6 }}>
                <LevelBadge level={topGap.current} size="sm" />
                <Txt variant="caption" tone="subtle">
                  needs {["Unskilled","Beginner","Practitioner","Proficient","Expert"][topGap.required]}
                </Txt>
              </Row>
              <GapBar current={topGap.current} required={topGap.required} />
            </View>

            {topGap.rationale ? (
              <View style={{
                marginTop: space.md, padding: space.md,
                borderRadius: radius.sm, backgroundColor: t.color.bgSunken,
              }}>
                <Row gap={6} style={{ marginBottom: 4 }}>
                  <Ionicons name="sparkles" size={12} color={t.color.primary} />
                  <Txt variant="overline" tone="primary">AI DIAGNOSIS</Txt>
                </Row>
                <Txt variant="small" tone="muted" numberOfLines={3}>{topGap.rationale}</Txt>
              </View>
            ) : null}
          </Card>
        </Animated.View>
      ) : null}

      {/* ── Progress trend ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(300).duration(360)}>
        <SectionHeader title="Accuracy trend" icon="pulse-outline" />
        <Card level={1}>
          <Row justify="space-between" align="flex-end">
            <View>
              <Txt variant="h1">{Math.round(DEMO_ACCURACY_TREND[DEMO_ACCURACY_TREND.length - 1] * 100)}%</Txt>
              <Row gap={4} style={{ marginTop: 2 }}>
                <Ionicons name="arrow-up" size={12} color={t.color.success} />
                <Txt variant="caption" tone="success">
                  +{Math.round((DEMO_ACCURACY_TREND[11] - DEMO_ACCURACY_TREND[0]) * 100)} pts over 12 weeks
                </Txt>
              </Row>
            </View>
            <Sparkline values={DEMO_ACCURACY_TREND} width={140} height={44} />
          </Row>
        </Card>
      </Animated.View>

      {/* ── Quick actions ──────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(360).duration(360)}>
        <SectionHeader title="Quick actions" icon="flash-outline" />
        <Row gap={space.md} wrap>
          <QuickAction icon="cloud-upload" label="Upload material"
                       sub="Generate a quiz" onPress={() => router.push("/(tabs)/library")} />
          <QuickAction icon="chatbubbles" label="Ask the tutor"
                       sub="Grounded in your notes" onPress={() => router.push("/tutor")} />
          <QuickAction icon="git-branch" label="Adaptive test"
                       sub="Measures you in ~10 Qs" onPress={() => router.push("/assessment")} />
          <QuickAction icon="school" label="iGOT courses"
                       sub="Matched to your gaps" onPress={() => router.push("/(tabs)/path")} />
        </Row>
      </Animated.View>
    </Screen>
  );
}

function QuickAction({
  icon, label, sub, onPress,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Card level={1} onPress={onPress} style={{ flex: 1, minWidth: 150 }}>
      <View style={{
        width: 36, height: 36, borderRadius: radius.sm,
        backgroundColor: t.color.primarySoft,
        alignItems: "center", justifyContent: "center", marginBottom: space.sm,
      }}>
        <Ionicons name={icon} size={18} color={t.color.primary} />
      </View>
      <Txt variant="bodyMd" numberOfLines={1}>{label}</Txt>
      <Txt variant="caption" tone="subtle" numberOfLines={1} style={{ marginTop: 2 }}>{sub}</Txt>
    </Card>
  );
}
