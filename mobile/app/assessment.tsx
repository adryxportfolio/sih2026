/**
 * Adaptive diagnostic.
 *
 * Each question is chosen to tell us the most about where this officer sits,
 * which is why the confidence band narrows visibly as they answer. That band
 * is the honest expression of the measurement: a wide one means we do not yet
 * know, and the app says so rather than quoting a precise-looking number it
 * cannot support.
 */
import React, { useMemo, useRef, useState, useCallback } from "react";
import { View, Pressable, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius, elevation } from "../src/theme";
import {
  Txt, Row, Card, Button, Badge, Divider, IconButton, ProgressBar, LevelBadge, useOnInverse,
} from "../src/components/ui";
import {
  Appear, CountUp, Confetti, AnimatedRing, GrowBar, useShake, Squish,
} from "../src/components/motion";
import {
  INITIAL_ABILITY, updateAbility, selectNextItem, shouldStop,
  confidenceInterval, equivalentFixedItems, itemInformation,
  type AbilityState,
} from "../src/lib/irt";
import { DEMO_ADAPTIVE_POOL, type AdaptiveDemoItem } from "../src/lib/demo";
import { useSession } from "../src/store/session";

type Phase = "intro" | "asking" | "revealed" | "done";

const LEVELS = ["Unskilled", "Beginner", "Practitioner", "Proficient", "Expert"];

export default function Assessment() {
  const t = useTheme();
  const router = useRouter();
  const onInv = useOnInverse();
  const { width } = useWindowDimensions();
  const { setActivity } = useSession();
  const { style: shakeStyle, shake } = useShake();

  const [phase, setPhase] = useState<Phase>("intro");
  const [ability, setAbility] = useState<AbilityState>(INITIAL_ABILITY);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<AdaptiveDemoItem | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<{ se: number; theta: number }[]>([]);
  const startedAt = useRef(Date.now());

  const pickNext = useCallback((theta: number, done: Set<string>) => {
    return selectNextItem(DEMO_ADAPTIVE_POOL, theta, done, (i) => i.id);
  }, []);

  const begin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActivity("assessment", "Adaptive diagnostic");
    const first = pickNext(INITIAL_ABILITY.theta, new Set());
    setCurrent(first);
    setPhase("asking");
    startedAt.current = Date.now();
  };

  const choose = (optionId: string) => {
    if (phase !== "asking" || !current) return;
    const correct = optionId === current.correct;

    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
    if (!correct) shake();

    const next = updateAbility(ability, current.difficulty, correct);
    setSelected(optionId);
    setAbility(next);
    setHistory((h) => [...h, { se: next.standardError, theta: next.theta }]);
    setPhase("revealed");
  };

  const advance = () => {
    if (!current) return;
    const done = new Set(answered); done.add(current.id);
    setAnswered(done);

    if (shouldStop(ability) || done.size >= DEMO_ADAPTIVE_POOL.length) {
      setPhase("done");
      setActivity("browsing");
      return;
    }
    const next = pickNext(ability.theta, done);
    if (!next) { setPhase("done"); return; }

    setCurrent(next);
    setSelected(null);
    setPhase("asking");
  };

  const [ciLow, ciHigh] = confidenceInterval(ability);
  // Progress toward the precision target, not toward a fixed question count —
  // the point is that the test ends when we actually know enough.
  const precision = Math.max(0, Math.min(1,
    (INITIAL_ABILITY.standardError - ability.standardError) /
    (INITIAL_ABILITY.standardError - 0.45),
  ));

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
        <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.huge }}>
          <Row style={{ marginBottom: space.lg }}>
            <IconButton icon="close" tone="plain" onPress={() => router.back()} />
          </Row>

          <Appear from="scale">
            <View style={{
              borderRadius: radius.xl, padding: space.xl,
              backgroundColor: t.color.bgInverse, ...elevation(3, t.color.shadow),
            }}>
              <Ionicons name="git-branch" size={30} color={onInv.strong} />
              <Txt variant="h1" style={{ color: onInv.strong, marginTop: space.base }}>
                Adaptive diagnostic
              </Txt>
              <Txt variant="body" style={{ color: onInv.muted, marginTop: space.sm, lineHeight: 23 }}>
                Each question is chosen based on how you answered the last one, so we reach a
                reliable measurement in about half the questions a fixed test would need.
              </Txt>
            </View>
          </Appear>

          <Appear delay={140}>
            <Card level={1} style={{ marginTop: space.base }}>
              <Txt variant="bodyMd" style={{ marginBottom: space.md }}>How it works</Txt>
              {[
                ["Answer well", "the next question gets harder"],
                ["Answer poorly", "it gets easier"],
                ["Either way", "we learn where you actually sit"],
              ].map(([a, b], i) => (
                <Row key={i} gap={space.md} align="flex-start" style={{ marginBottom: space.sm }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, marginTop: 1,
                    backgroundColor: t.color.bgSunken,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Txt variant="overline">{i + 1}</Txt>
                  </View>
                  <Txt variant="small" tone="muted" style={{ flex: 1, lineHeight: 20 }}>
                    <Txt variant="bodyMd">{a}</Txt> — {b}
                  </Txt>
                </Row>
              ))}
              <Divider style={{ marginVertical: space.md }} />
              <Txt variant="caption" tone="subtle" style={{ lineHeight: 18 }}>
                The test stops when the measurement is precise enough, not after a fixed
                number of questions. Typically 8–13 items.
              </Txt>
            </Card>
          </Appear>

          <Appear delay={220}>
            <Button label="Begin" full size="lg" icon="play" onPress={begin}
                    style={{ marginTop: space.xl }} />
          </Appear>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (phase === "done") {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const fixedEquiv = equivalentFixedItems(ability);
    const saved = Math.max(0, fixedEquiv - ability.items);
    const level = Math.round(ability.theta);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
        <Confetti active width={width} count={28} />
        <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.huge }}>
          <Appear from="scale" duration={520}>
            <View style={{ alignItems: "center", paddingVertical: space.xl }}>
              <AnimatedRing value={ability.theta / 4} size={168} stroke={13} delay={220}>
                <CountUp value={ability.theta} decimals={1} variant="display" delay={220} />
                <Txt variant="overline" tone="subtle">OF 4.0</Txt>
              </AnimatedRing>
              <Appear delay={760}>
                <View style={{ alignItems: "center", marginTop: space.lg }}>
                  <LevelBadge level={level} />
                  <Txt variant="small" tone="muted" center style={{ marginTop: space.sm, maxWidth: 300 }}>
                    Measured in {ability.items} questions over {minutes} minute{minutes === 1 ? "" : "s"}
                  </Txt>
                </View>
              </Appear>
            </View>
          </Appear>

          {/* Honest precision statement */}
          <Appear delay={860}>
            <Card level={2}>
              <Txt variant="overline" tone="muted">HOW SURE WE ARE</Txt>
              <Txt variant="h3" style={{ marginTop: 6 }}>
                {ciLow.toFixed(1)} – {ciHigh.toFixed(1)}
              </Txt>
              <Txt variant="caption" tone="subtle" style={{ marginTop: 4 }}>
                95% confidence interval · standard error {ability.standardError.toFixed(2)}
              </Txt>
              <GrowBar value={precision} height={7} delay={900} style={{ marginTop: space.md }} />
              <Txt variant="small" tone="muted" style={{ marginTop: space.md, lineHeight: 20 }}>
                A range rather than a single number, because that is what the evidence
                supports. More questions would narrow it — but past this point each one adds
                very little, which is exactly why the test stopped here.
              </Txt>
            </Card>
          </Appear>

          <Appear delay={940}>
            <Card level={1} style={{ marginTop: space.md }}>
              <Row justify="space-between" align="center">
                <View>
                  <Txt variant="overline" tone="subtle">QUESTIONS ASKED</Txt>
                  <Txt variant="h2" style={{ marginTop: 2 }}>{ability.items}</Txt>
                </View>
                <Ionicons name="arrow-forward" size={17} color={t.color.textSubtle} />
                <View style={{ alignItems: "flex-end" }}>
                  <Txt variant="overline" tone="subtle">FIXED TEST WOULD NEED</Txt>
                  <Txt variant="h2" style={{ marginTop: 2 }}>{fixedEquiv}</Txt>
                </View>
              </Row>
              {saved > 0 ? (
                <>
                  <Divider style={{ marginVertical: space.md }} />
                  <Row gap={6}>
                    <Ionicons name="flash" size={13} color={t.color.success} />
                    <Txt variant="small" tone="success">
                      {saved} fewer questions for the same precision
                    </Txt>
                  </Row>
                </>
              ) : null}
            </Card>
          </Appear>

          <Appear delay={1020}>
            <Card level={1} style={{ marginTop: space.md }}>
              <Txt variant="bodyMd" style={{ marginBottom: space.md }}>Convergence</Txt>
              <View style={{ gap: 6 }}>
                {history.map((h, i) => (
                  <Row key={i} gap={space.sm} align="center">
                    <Txt variant="overline" tone="subtle" style={{ width: 18 }}>{i + 1}</Txt>
                    <View style={{ flex: 1 }}>
                      <GrowBar
                        value={1 - Math.min(1, h.se / INITIAL_ABILITY.standardError)}
                        height={5} delay={1060 + i * 40}
                      />
                    </View>
                    <Txt variant="overline" tone="subtle" style={{ width: 34, textAlign: "right" }}>
                      ±{h.se.toFixed(2)}
                    </Txt>
                  </Row>
                ))}
              </View>
              <Txt variant="caption" tone="subtle" style={{ marginTop: space.md, lineHeight: 18 }}>
                Uncertainty falling with each answer. It drops fastest when a question is
                well matched to your ability — which is precisely how they were chosen.
              </Txt>
            </Card>
          </Appear>

          <Button label="Back to dashboard" full size="lg" icon="arrow-back"
                  style={{ marginTop: space.xl }} onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── QUESTION ──────────────────────────────────────────────────────────────
  if (!current) return null;
  const isCorrect = selected === current.correct;
  const info = itemInformation(ability.theta, current.difficulty);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      {/* Live measurement header — the whole point made visible */}
      <View style={{ paddingHorizontal: space.base, paddingTop: space.sm }}>
        <Row justify="space-between" style={{ marginBottom: space.sm }}>
          <IconButton icon="close" tone="plain" onPress={() => router.back()} />
          <View style={{ flex: 1, marginHorizontal: space.md }}>
            <ProgressBar value={precision} height={6} />
          </View>
          <Txt variant="caption" tone="muted">Q{ability.items + 1}</Txt>
        </Row>

        <Card level={1} tone="sunken" style={{ marginBottom: space.base }}>
          <Row justify="space-between" align="center">
            <View>
              <Txt variant="overline" tone="subtle">ESTIMATE</Txt>
              <Row gap={4} align="flex-end">
                <Txt variant="h3">{ability.theta.toFixed(2)}</Txt>
                <Txt variant="caption" tone="subtle" style={{ marginBottom: 3 }}>
                  ±{ability.standardError.toFixed(2)}
                </Txt>
              </Row>
            </View>
            <View style={{ flex: 1, marginHorizontal: space.base }}>
              {/* Confidence band, drawn to scale on the 0..4 ladder */}
              <View style={{
                height: 8, borderRadius: 4,
                backgroundColor: t.color.bgElevated, overflow: "hidden",
              }}>
                <View style={{
                  position: "absolute",
                  left: `${(ciLow / 4) * 100}%`,
                  width: `${((ciHigh - ciLow) / 4) * 100}%`,
                  top: 0, bottom: 0,
                  backgroundColor: t.color.text, opacity: 0.25,
                }} />
                <View style={{
                  position: "absolute",
                  left: `${(ability.theta / 4) * 100}%`,
                  top: -2, bottom: -2, width: 2.5,
                  backgroundColor: t.color.text,
                  transform: [{ translateX: -1.25 }],
                }} />
              </View>
              <Row justify="space-between" style={{ marginTop: 3 }}>
                <Txt variant="overline" tone="subtle">0</Txt>
                <Txt variant="overline" tone="subtle">4</Txt>
              </Row>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Txt variant="overline" tone="subtle">LEVEL</Txt>
              <Txt variant="caption">{LEVELS[Math.round(ability.theta)]}</Txt>
            </View>
          </Row>
        </Card>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: 150 }}
                  showsVerticalScrollIndicator={false}>
        <Row gap={space.sm} wrap style={{ marginBottom: space.md }}>
          <Badge label={current.competency_code} tone="neutral" size="sm" />
          <Badge label={`DIFFICULTY ${current.difficulty.toFixed(1)}`} tone="neutral" size="sm" />
          <Badge label={`INFO ${info.toFixed(2)}`} tone="primary" size="sm" icon="flash" />
        </Row>

        <Txt variant="h3" style={{ lineHeight: 27, marginBottom: space.lg }}>{current.stem}</Txt>

        <Animated.View style={[{ gap: space.md }, shakeStyle]}>
          {current.options.map((opt) => {
            const chosen = selected === opt.id;
            const isAnswer = opt.id === current.correct;
            const revealed = phase === "revealed";

            let bg = t.color.bgElevated, border = t.color.border;
            let icon: keyof typeof Ionicons.glyphMap | null = null;

            if (revealed) {
              if (isAnswer) { bg = t.color.successSoft; border = t.color.success; icon = "checkmark-circle"; }
              else if (chosen) { bg = t.color.dangerSoft; border = t.color.danger; icon = "close-circle"; }
            } else if (chosen) { bg = t.color.primarySoft; border = t.color.primary; }

            return (
              <Pressable
                key={opt.id}
                onPress={() => choose(opt.id)}
                disabled={phase !== "asking"}
                style={{
                  borderRadius: radius.md, backgroundColor: bg,
                  borderWidth: 1.5, borderColor: border, padding: space.base,
                }}
              >
                <Row gap={space.md} align="flex-start">
                  <View style={{
                    width: 26, height: 26, borderRadius: 13,
                    backgroundColor: revealed && isAnswer ? t.color.success
                      : revealed && chosen ? t.color.danger : t.color.bgSunken,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {icon ? <Ionicons name={icon} size={16} color="#FFFFFF" />
                          : <Txt variant="caption" tone="muted">{opt.id.toUpperCase()}</Txt>}
                  </View>
                  <Txt variant="body" style={{ flex: 1, lineHeight: 22 }}>{opt.text}</Txt>
                </Row>
              </Pressable>
            );
          })}
        </Animated.View>

        {phase === "revealed" ? (
          <Appear from="bottom">
            <Card level={2} tone="primary" style={{ marginTop: space.lg }}>
              <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                <Ionicons name={isCorrect ? "checkmark-circle" : "bulb"} size={17}
                          color={isCorrect ? t.color.success : t.color.text} />
                <Txt variant="bodyMd" tone={isCorrect ? "success" : "default"}>
                  {isCorrect ? "Correct" : "Not quite"}
                </Txt>
              </Row>
              <Txt variant="body" tone="muted" style={{ lineHeight: 23 }}>
                {current.explanation}
              </Txt>
              <Divider style={{ marginVertical: space.md }} />
              <Txt variant="caption" tone="subtle" style={{ lineHeight: 18 }}>
                Estimate moved to {ability.theta.toFixed(2)}, uncertainty narrowed to
                ±{ability.standardError.toFixed(2)}.
                {shouldStop(ability)
                  ? " That is precise enough — this is the last question."
                  : " The next question is picked to narrow it further."}
              </Txt>
            </Card>
          </Appear>
        ) : null}
      </ScrollView>

      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        backgroundColor: t.color.bgElevated,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
        paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.xxl,
      }}>
        {phase === "asking" ? (
          <Txt variant="small" tone="subtle" center>Select an answer</Txt>
        ) : (
          <Button
            label={shouldStop(ability) ? "See your result" : "Next question"}
            iconRight={shouldStop(ability) ? "trophy" : "arrow-forward"}
            full size="lg" onPress={advance}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
