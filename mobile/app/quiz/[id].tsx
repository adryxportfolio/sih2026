import React, { useMemo, useState, useRef } from "react";
import { View, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInRight } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius, elevation } from "../../src/theme";
import {
  Txt, Row, Card, Button, Badge, ProgressBar, Divider, IconButton, LevelBadge,
} from "../../src/components/ui";
import { BloomBars } from "../../src/components/charts";
import { DEMO_QUIZ } from "../../src/lib/demo";

type Phase = "answering" | "confidence" | "revealed" | "done";

interface Answer {
  questionId: string;
  selected: string | null;
  correct: boolean;
  confidence: number;
  timeMs: number;
}

export default function QuizPlayer() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const quiz = DEMO_QUIZ;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [selected, setSelected] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [showSource, setShowSource] = useState(false);
  const startedAt = useRef(Date.now());

  const q = quiz.questions[idx];
  const isLast = idx === quiz.questions.length - 1;

  const choose = (optId: string) => {
    if (phase !== "answering") return;
    Haptics.selectionAsync().catch(() => {});
    setSelected(optId);
    setPhase("confidence");
  };

  const submitConfidence = (c: number) => {
    const correct = q.correct_option_ids.includes(selected ?? "");
    setConfidence(c);
    setPhase("revealed");
    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
    setAnswers((a) => [...a, {
      questionId: q.id, selected, correct, confidence: c,
      timeMs: Date.now() - startedAt.current,
    }]);
  };

  const next = () => {
    if (isLast) { setPhase("done"); return; }
    setIdx((i) => i + 1);
    setSelected(null);
    setConfidence(null);
    setShowSource(false);
    setPhase("answering");
    startedAt.current = Date.now();
  };

  const quit = () => {
    Alert.alert("Leave quiz?", "Your progress on this attempt will be lost.", [
      { text: "Keep going", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);
  };

  // ── Results ───────────────────────────────────────────────────────────────
  if (phase === "done") {
    const correct = answers.filter((a) => a.correct).length;
    const score = correct / answers.length;
    const calibration = answers.length
      ? answers.reduce((s, a) => s + Math.abs((a.confidence - 1) / 4 - (a.correct ? 1 : 0)), 0) / answers.length
      : 0;
    const overconfident = answers.filter((a) => !a.correct && a.confidence >= 4).length;
    const underconfident = answers.filter((a) => a.correct && a.confidence <= 2).length;

    const bloomCounts = quiz.questions.reduce((acc, qq) => {
      acc[qq.bloom] = (acc[qq.bloom] ?? 0) + 1; return acc;
    }, {} as Record<string, number>);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
        <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.huge }}>
          <Animated.View entering={FadeInDown.duration(420)} style={{ alignItems: "center", paddingVertical: space.xl }}>
            <View style={{
              width: 84, height: 84, borderRadius: 42,
              backgroundColor: score >= 0.7 ? t.color.successSoft : t.color.warningSoft,
              alignItems: "center", justifyContent: "center", marginBottom: space.base,
            }}>
              <Ionicons
                name={score >= 0.7 ? "trophy" : "trending-up"}
                size={38}
                color={score >= 0.7 ? t.color.success : t.color.warning}
              />
            </View>
            <Txt variant="display">{Math.round(score * 100)}%</Txt>
            <Txt variant="body" tone="muted">{correct} of {answers.length} correct</Txt>
          </Animated.View>

          {/* Calibration — the metacognition payoff */}
          <Animated.View entering={FadeInDown.delay(120).duration(360)}>
            <Card level={2} tone="primary">
              <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                <Ionicons name="compass" size={16} color={t.color.primary} />
                <Txt variant="bodyMd" tone="primary">How well do you know what you know?</Txt>
              </Row>
              <Row justify="space-between" align="flex-end" style={{ marginBottom: space.sm }}>
                <Txt variant="h2">{calibration.toFixed(2)}</Txt>
                <Badge
                  label={calibration < 0.2 ? "WELL CALIBRATED" : calibration < 0.35 ? "REASONABLE" : "MISCALIBRATED"}
                  tone={calibration < 0.2 ? "success" : calibration < 0.35 ? "warning" : "danger"}
                  size="sm"
                />
              </Row>
              <ProgressBar value={1 - Math.min(1, calibration * 2)} height={7}
                           tone={calibration < 0.2 ? "success" : "warning"} />
              <Txt variant="small" tone="muted" style={{ marginTop: space.md, lineHeight: 20 }}>
                {overconfident > 0
                  ? `You were confident and wrong on ${overconfident} question${overconfident > 1 ? "s" : ""}. That pattern is worth watching — it's the kind of error that doesn't get caught, because you don't go back and check.`
                  : underconfident > 0
                    ? `You were unsure but correct on ${underconfident} question${underconfident > 1 ? "s" : ""}. You know more than you're crediting yourself for.`
                    : "Your confidence tracked your accuracy closely. That self-awareness is what lets you know when to double-check your own work."}
              </Txt>
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(360)}>
            <Card level={1} style={{ marginTop: space.md }}>
              <Txt variant="bodyMd" style={{ marginBottom: space.md }}>Cognitive level tested</Txt>
              <BloomBars counts={bloomCounts} />
              <Txt variant="caption" tone="subtle" style={{ marginTop: space.md, lineHeight: 17 }}>
                A quiz weighted toward Apply and Analyse measures competency. One weighted
                toward Remember only measures recall.
              </Txt>
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).duration(360)}>
            <Card level={1} style={{ marginTop: space.md }}>
              <Txt variant="bodyMd" style={{ marginBottom: space.md }}>Competency impact</Txt>
              {["FUN-SAMP-01", "FUN-CLEAN-01", "FUN-CONF-01"].map((code) => {
                const related = answers.filter((a) => {
                  const qq = quiz.questions.find((x) => x.id === a.questionId);
                  return qq?.competency_code === code;
                });
                if (!related.length) return null;
                const ok = related.filter((a) => a.correct).length;
                return (
                  <Row key={code} justify="space-between" style={{ marginBottom: space.sm }}>
                    <Txt variant="small" tone="muted">{code}</Txt>
                    <Row gap={space.sm}>
                      <Txt variant="small">{ok}/{related.length}</Txt>
                      <Ionicons
                        name={ok === related.length ? "arrow-up-circle" : "arrow-down-circle"}
                        size={15}
                        color={ok === related.length ? t.color.success : t.color.danger}
                      />
                    </Row>
                  </Row>
                );
              })}
              <Txt variant="caption" tone="subtle" style={{ marginTop: space.sm }}>
                These results update your FRAC profile and re-prioritise your plan.
              </Txt>
            </Card>
          </Animated.View>

          <Button label="Back to library" full size="lg" style={{ marginTop: space.xl }}
                  onPress={() => router.back()} icon="arrow-back" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Question ──────────────────────────────────────────────────────────────
  const isCorrect = q.correct_option_ids.includes(selected ?? "");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: space.base, paddingTop: space.sm }}>
        <Row justify="space-between" style={{ marginBottom: space.md }}>
          <IconButton icon="close" tone="plain" onPress={quit} accessibilityLabel="Close quiz" />
          <View style={{ flex: 1, marginHorizontal: space.md }}>
            <ProgressBar value={(idx + (phase === "revealed" ? 1 : 0)) / quiz.questions.length} height={6} />
          </View>
          <Txt variant="caption" tone="muted">{idx + 1}/{quiz.questions.length}</Txt>
        </Row>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: 140 }}
                  showsVerticalScrollIndicator={false}>
        <Animated.View key={q.id} entering={SlideInRight.duration(260)}>
          <Row gap={space.sm} wrap style={{ marginBottom: space.md }}>
            <Badge label={q.bloom.toUpperCase()} tone="primary" size="sm" />
            <Badge label={`DIFFICULTY ${q.difficulty.toFixed(1)}`} tone="neutral" size="sm" />
            <Badge label={q.competency_code} tone="neutral" size="sm" />
          </Row>

          <Txt variant="h3" style={{ lineHeight: 27, marginBottom: space.lg }}>{q.stem}</Txt>

          <View style={{ gap: space.md }}>
            {q.options.map((opt) => {
              const chosen = selected === opt.id;
              const correctOpt = q.correct_option_ids.includes(opt.id);
              const revealed = phase === "revealed";

              let bg = t.color.bgElevated;
              let border = t.color.border;
              let icon: keyof typeof Ionicons.glyphMap | null = null;
              let iconColor = t.color.textSubtle;

              if (revealed) {
                if (correctOpt) {
                  bg = t.color.successSoft; border = t.color.success;
                  icon = "checkmark-circle"; iconColor = t.color.success;
                } else if (chosen) {
                  bg = t.color.dangerSoft; border = t.color.danger;
                  icon = "close-circle"; iconColor = t.color.danger;
                }
              } else if (chosen) {
                bg = t.color.primarySoft; border = t.color.primary;
              }

              return (
                <Pressable
                  key={opt.id}
                  onPress={() => choose(opt.id)}
                  disabled={phase !== "answering"}
                  style={{
                    borderRadius: radius.md,
                    backgroundColor: bg,
                    borderWidth: 1.5,
                    borderColor: border,
                    padding: space.base,
                    ...(chosen && !revealed ? elevation(2, t.color.shadow) : {}),
                  }}
                >
                  <Row gap={space.md} align="flex-start">
                    <View style={{
                      width: 26, height: 26, borderRadius: 13,
                      backgroundColor: chosen || (revealed && correctOpt)
                        ? (revealed ? (correctOpt ? t.color.success : t.color.danger) : t.color.primary)
                        : t.color.bgSunken,
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {icon
                        ? <Ionicons name={icon} size={16} color="#FFFFFF" />
                        : <Txt variant="caption" style={{
                            color: chosen ? t.color.onPrimary : t.color.textMuted,
                          }}>{opt.id.toUpperCase()}</Txt>}
                    </View>
                    <Txt variant="body" style={{ flex: 1, lineHeight: 22 }}>{opt.text}</Txt>
                  </Row>

                  {/* Distractor diagnosis — why this specific wrong answer is tempting */}
                  {revealed && !correctOpt && q.distractor_rationales[opt.id] ? (
                    // Deliberately NOT animated: Reanimated's entering animations
                    // leave visibility:hidden on web when a nested conditional
                    // mounts inside an already-animating parent.
                    <Row gap={6} align="flex-start" style={{
                      marginTop: space.sm, paddingTop: space.sm,
                      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
                    }}>
                      <Ionicons name="information-circle-outline" size={13}
                                color={t.color.textSubtle} style={{ marginTop: 1 }} />
                      <Txt variant="caption" tone="subtle" style={{ flex: 1, lineHeight: 17 }}>
                        {q.distractor_rationales[opt.id]}
                      </Txt>
                    </Row>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Explanation */}
          {phase === "revealed" ? (
            <Animated.View entering={FadeInUp.duration(320)}>
              <Card level={2} tone="primary" style={{ marginTop: space.lg }}>
                <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                  <Ionicons name={isCorrect ? "checkmark-circle" : "bulb"} size={17}
                            color={isCorrect ? t.color.success : t.color.primary} />
                  <Txt variant="bodyMd" tone={isCorrect ? "success" : "primary"}>
                    {isCorrect ? "Correct" : "Here's why"}
                  </Txt>
                </Row>
                <Txt variant="body" tone="muted" style={{ lineHeight: 23 }}>{q.explanation}</Txt>

                {q.source_quote ? (
                  <>
                    <Pressable onPress={() => setShowSource((s) => !s)} style={{ marginTop: space.md }}>
                      <Row gap={6}>
                        <Ionicons name="shield-checkmark" size={13} color={t.color.success} />
                        <Txt variant="caption" tone="success">
                          Grounded in your material
                        </Txt>
                        <Ionicons name={showSource ? "chevron-up" : "chevron-down"}
                                  size={13} color={t.color.textSubtle} />
                      </Row>
                    </Pressable>
                    {showSource ? (
                      <Animated.View entering={FadeIn.duration(200)} style={{
                        marginTop: space.sm, padding: space.md,
                        borderRadius: radius.sm, backgroundColor: t.color.bgSunken,
                        borderLeftWidth: 3, borderLeftColor: t.color.success,
                      }}>
                        <Txt variant="small" tone="muted" style={{ fontStyle: "italic", lineHeight: 21 }}>
                          "{q.source_quote}"
                        </Txt>
                      </Animated.View>
                    ) : null}
                  </>
                ) : null}
              </Card>
            </Animated.View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        backgroundColor: t.color.bgElevated,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
        paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.xxl,
      }}>
        {phase === "answering" ? (
          <Txt variant="small" tone="subtle" center>Select an answer to continue</Txt>
        ) : null}

        {phase === "confidence" ? (
          <Animated.View entering={FadeInUp.duration(260)}>
            <Txt variant="bodyMd" center style={{ marginBottom: 4 }}>How sure are you?</Txt>
            <Txt variant="caption" tone="subtle" center style={{ marginBottom: space.md }}>
              Rating before you see the answer is what makes this measurable
            </Txt>
            <Row gap={space.sm} justify="center">
              {[1, 2, 3, 4, 5].map((c) => (
                <Pressable
                  key={c}
                  onPress={() => submitConfidence(c)}
                  style={{
                    flex: 1, height: 54, borderRadius: radius.md,
                    backgroundColor: t.color.bgSunken,
                    borderWidth: 1.5, borderColor: t.color.border,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Txt variant="h3" tone="primary">{c}</Txt>
                </Pressable>
              ))}
            </Row>
            <Row justify="space-between" style={{ marginTop: 6 }}>
              <Txt variant="overline" tone="subtle">GUESSING</Txt>
              <Txt variant="overline" tone="subtle">CERTAIN</Txt>
            </Row>
          </Animated.View>
        ) : null}

        {phase === "revealed" ? (
          <Button
            label={isLast ? "See results" : "Next question"}
            iconRight={isLast ? "trophy" : "arrow-forward"}
            full size="lg" onPress={next}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
