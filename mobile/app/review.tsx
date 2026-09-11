import React, { useMemo, useState, useRef } from "react";
import { View, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInUp, FadeInDown, SlideInRight } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius, elevation } from "../src/theme";
import { Txt, Row, Card, Button, Badge, ProgressBar, IconButton, Divider } from "../src/components/ui";
import { FSRS, cardFromRow, formatInterval, type FsrsCard, type Rating } from "../src/lib/fsrs";
import { DEMO_CARDS } from "../src/lib/demo";
import { useSession } from "../src/store/session";

const RATING_META: { r: Rating; label: string; hint: string; tone: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { r: 1, label: "Again", hint: "Didn't recall", tone: "danger", icon: "close-circle" },
  { r: 2, label: "Hard", hint: "Recalled with effort", tone: "warning", icon: "remove-circle" },
  { r: 3, label: "Good", hint: "Recalled correctly", tone: "primary", icon: "checkmark-circle" },
  { r: 4, label: "Easy", hint: "Instant", tone: "success", icon: "flash" },
];

export default function Review() {
  const t = useTheme();
  const router = useRouter();
  const { profile } = useSession();

  const scheduler = useMemo(
    () => new FSRS({ desiredRetention: profile?.desired_retention ?? 0.9 }),
    [profile?.desired_retention],
  );

  // Seed the queue from demo cards that are due
  const initial = useMemo(() => {
    const now = Date.now();
    return DEMO_CARDS
      .filter((c) => c.due <= 0)
      .map((c) => ({
        meta: c,
        card: cardFromRow({
          state: c.state, stability: c.stability, difficulty: c.difficulty,
          due: new Date(now + c.due * 86400000).toISOString(),
          last_review: c.reps > 0 ? new Date(now - 86400000 * 3).toISOString() : null,
          reps: c.reps, lapses: c.lapses, step: 0,
        }) as FsrsCard,
      }));
  }, []);

  const [queue, setQueue] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const startedAt = useRef(Date.now());

  const current = queue[idx];
  const total = queue.length;

  const preview = useMemo(
    () => (current ? scheduler.preview(current.card) : null),
    [current, scheduler],
  );

  const retrievability = useMemo(() => {
    if (!current || current.card.stability <= 0 || !current.card.lastReview) return null;
    const elapsed = (Date.now() - current.card.lastReview.getTime()) / 86400000;
    return scheduler.retrievability(elapsed, current.card.stability);
  }, [current, scheduler]);

  const rate = (r: Rating) => {
    if (!current) return;
    Haptics.impactAsync(
      r === 1 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});

    const { card: next } = scheduler.review(current.card, r);

    setRatings((x) => [...x, r]);
    setDone((d) => d + 1);

    // "Again" puts the card back near the end of this session's queue
    if (r === 1) {
      setQueue((qs) => [...qs, { meta: current.meta, card: next }]);
    }

    setFlipped(false);
    setIdx((i) => i + 1);
  };

  // ── Session complete ──────────────────────────────────────────────────────
  if (!current) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const again = ratings.filter((r) => r === 1).length;
    const accuracy = ratings.length ? (ratings.length - again) / ratings.length : 1;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
        <ScrollView contentContainerStyle={{ padding: space.base }}>
          <Animated.View entering={FadeInDown.duration(420)}
                         style={{ alignItems: "center", paddingVertical: space.xxxl }}>
            <View style={{
              width: 84, height: 84, borderRadius: 42,
              backgroundColor: t.color.successSoft,
              alignItems: "center", justifyContent: "center", marginBottom: space.base,
            }}>
              <Ionicons name="checkmark-done" size={40} color={t.color.success} />
            </View>
            <Txt variant="h1">Session complete</Txt>
            <Txt variant="body" tone="muted" center style={{ marginTop: 6 }}>
              {done} review{done === 1 ? "" : "s"} in {minutes} minute{minutes === 1 ? "" : "s"}
            </Txt>
          </Animated.View>

          <Row gap={space.md}>
            <Card level={1} style={{ flex: 1, alignItems: "center" }}>
              <Txt variant="h1">{Math.round(accuracy * 100)}%</Txt>
              <Txt variant="overline" tone="subtle">RECALLED</Txt>
            </Card>
            <Card level={1} style={{ flex: 1, alignItems: "center" }}>
              <Txt variant="h1">+{done * 12}</Txt>
              <Txt variant="overline" tone="subtle">XP EARNED</Txt>
            </Card>
          </Row>

          <Card level={1} tone="primary" style={{ marginTop: space.md }}>
            <Row gap={space.sm} style={{ marginBottom: space.sm }}>
              <Ionicons name="repeat" size={15} color={t.color.primary} />
              <Txt variant="bodyMd" tone="primary">Scheduled by FSRS-6</Txt>
            </Row>
            <Txt variant="small" tone="muted" style={{ lineHeight: 21 }}>
              Each card's next review is set for the moment your recall probability
              is predicted to fall to {Math.round((profile?.desired_retention ?? 0.9) * 100)}%.
              Reviewing sooner wastes effort; later loses the memory.
            </Txt>
          </Card>

          <Button label="Done" full size="lg" style={{ marginTop: space.xl }}
                  onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Card ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <View style={{ paddingHorizontal: space.base, paddingTop: space.sm }}>
        <Row justify="space-between" style={{ marginBottom: space.md }}>
          <IconButton icon="close" tone="plain" onPress={() => router.back()} accessibilityLabel="Exit review" />
          <View style={{ flex: 1, marginHorizontal: space.md }}>
            <ProgressBar value={done / Math.max(total, done + 1)} height={6} />
          </View>
          <Txt variant="caption" tone="muted">{done}/{total}</Txt>
        </Row>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: 220 }}
                  showsVerticalScrollIndicator={false}>
        <Animated.View key={`${current.meta.id}-${idx}`} entering={SlideInRight.duration(240)}>
          {/* Memory state — transparency about the algorithm */}
          <Row gap={space.sm} wrap style={{ marginBottom: space.base }}>
            <Badge label={current.card.state.toUpperCase()} tone="primary" size="sm" />
            <Badge label={current.meta.competency_code} tone="neutral" size="sm" />
            {retrievability != null ? (
              <Badge
                label={`RECALL ${Math.round(retrievability * 100)}%`}
                tone={retrievability > 0.9 ? "success" : retrievability > 0.7 ? "warning" : "danger"}
                size="sm"
              />
            ) : null}
          </Row>

          <Pressable onPress={() => !flipped && setFlipped(true)}>
            <Card level={3} style={{ minHeight: 200, justifyContent: "center", padding: space.xl }}>
              <Txt variant="overline" tone="subtle" style={{ marginBottom: space.md }}>QUESTION</Txt>
              <Txt variant="h3" style={{ lineHeight: 28 }}>{current.meta.front}</Txt>

              {!flipped ? (
                <Row gap={6} justify="center" style={{ marginTop: space.xl }}>
                  <Ionicons name="eye-outline" size={15} color={t.color.textSubtle} />
                  <Txt variant="small" tone="subtle">Try to recall, then tap to reveal</Txt>
                </Row>
              ) : null}
            </Card>
          </Pressable>

          {flipped ? (
            <Animated.View entering={FadeInUp.duration(300)}>
              <Card level={2} tone="primary" style={{ marginTop: space.md, padding: space.xl }}>
                <Txt variant="overline" tone="primary" style={{ marginBottom: space.md }}>ANSWER</Txt>
                <Txt variant="bodyLg" style={{ lineHeight: 26 }}>{current.meta.back}</Txt>

                {current.meta.elaboration ? (
                  <>
                    <Divider style={{ marginVertical: space.base }} />
                    <Row gap={6} align="flex-start">
                      <Ionicons name="bulb" size={14} color={t.color.primary} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="overline" tone="primary" style={{ marginBottom: 4 }}>WHY</Txt>
                        <Txt variant="small" tone="muted" style={{ lineHeight: 21 }}>
                          {current.meta.elaboration}
                        </Txt>
                      </View>
                    </Row>
                  </>
                ) : null}
              </Card>

              {/* FSRS internals — shown because explainability is a feature */}
              <Card level={1} style={{ marginTop: space.md }}>
                <Txt variant="overline" tone="subtle" style={{ marginBottom: space.sm }}>MEMORY STATE</Txt>
                <Row justify="space-between">
                  <MemStat label="Stability" value={`${current.card.stability.toFixed(1)}d`} />
                  <MemStat label="Difficulty" value={`${current.card.difficulty.toFixed(1)}/10`} />
                  <MemStat label="Reviews" value={String(current.card.reps)} />
                  <MemStat label="Lapses" value={String(current.card.lapses)} />
                </Row>
              </Card>
            </Animated.View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Rating bar */}
      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        backgroundColor: t.color.bgElevated,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
        paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.xxl,
      }}>
        {!flipped ? (
          <Button label="Show answer" full size="lg" icon="eye" onPress={() => setFlipped(true)} />
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            <Txt variant="caption" tone="subtle" center style={{ marginBottom: space.md }}>
              How well did you recall it?
            </Txt>
            <Row gap={space.sm}>
              {RATING_META.map((m) => {
                const color = (t.color as any)[m.tone] as string;
                return (
                  <Pressable
                    key={m.r}
                    onPress={() => rate(m.r)}
                    style={{
                      flex: 1, borderRadius: radius.md, paddingVertical: space.md,
                      backgroundColor: color + "18",
                      borderWidth: 1.5, borderColor: color + "55",
                      alignItems: "center", gap: 3,
                    }}
                  >
                    <Ionicons name={m.icon} size={18} color={color} />
                    <Txt variant="caption" style={{ color }}>{m.label}</Txt>
                    <Txt variant="overline" tone="subtle">
                      {preview ? preview[m.r].label : "—"}
                    </Txt>
                  </Pressable>
                );
              })}
            </Row>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

function MemStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Txt variant="bodyMd">{value}</Txt>
      <Txt variant="overline" tone="subtle">{label.toUpperCase()}</Txt>
    </View>
  );
}
