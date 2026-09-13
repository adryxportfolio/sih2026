/**
 * Practice on a piece of study material.
 *
 *   Quiz        one question at a time, feedback and the reason straight away —
 *               for learning.
 *   Flashcards  recall first, then check; the cards you miss come round again.
 *   Mock test   timed, no feedback until you submit — for finding out where you
 *               stand before the departmental exam does it for you.
 *
 * Everything is written by Samiksha AI from the material the administrator
 * assigned, and the screen says whether it came from the document itself or
 * only from a video's description, so the officer knows how far to trust it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius } from "../src/theme";
import { Txt, Row, Card, Button, Badge, IconButton, Divider, ProgressBar } from "../src/components/ui";
import { useSession } from "../src/store/session";
import { confirmAsync } from "../src/lib/dialog";
import {
  generatePractice, loadPracticeMaterial, recordPractice, GROUNDING_LABEL, MODE_LABEL,
  type Practice, type PracticeCard, type PracticeMaterial, type PracticeMode, type PracticeQuestion,
} from "../src/lib/study";

export default function PracticeScreen() {
  const t = useTheme();
  const router = useRouter();
  const { isDemo, setActivity } = useSession();
  const params = useLocalSearchParams<{ id: string; mode?: string }>();
  const mode: PracticeMode = params.mode === "flashcards" || params.mode === "mock" ? params.mode : "quiz";

  const [material, setMaterial] = useState<PracticeMaterial | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  useEffect(() => { setActivity(mode === "flashcards" ? "reviewing" : "quiz", MODE_LABEL[mode]); }, [mode, setActivity]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPractice(null);
    (async () => {
      try {
        const m = material ?? await loadPracticeMaterial(isDemo, String(params.id));
        if (cancelled) return;
        setMaterial(m);
        const p = await generatePractice(isDemo, m, mode);
        if (!cancelled) setPractice(p);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, mode, isDemo, attempt]);

  const switchMode = (next: PracticeMode) =>
    router.replace({ pathname: "/practice", params: { id: String(params.id), mode: next } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={["top", "bottom"]}>
      <Row justify="space-between" style={{ paddingHorizontal: space.base, paddingVertical: space.sm }}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <IconButton icon="close" tone="plain" onPress={close} accessibilityLabel="Close" />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">{MODE_LABEL[mode]}</Txt>
            <Txt variant="overline" tone="subtle" numberOfLines={1}>
              {(material?.title ?? "Study material").toUpperCase()}
            </Txt>
          </View>
        </Row>
      </Row>
      <Divider />

      {error ? (
        <View style={{ flex: 1, padding: space.base, justifyContent: "center" }}>
          <Card level={1} style={{ padding: space.lg }}>
            <Ionicons name="alert-circle-outline" size={26} color={t.color.text} />
            <Txt variant="h3" style={{ marginTop: space.md }}>Could not prepare this</Txt>
            <Txt variant="body" tone="muted" style={{ marginTop: space.sm }}>{error}</Txt>
            <Button label="Try again" icon="refresh" full style={{ marginTop: space.lg }}
                    onPress={() => setAttempt((a) => a + 1)} />
          </Card>
        </View>
      ) : !practice ? (
        <Loading mode={mode} title={material?.title} />
      ) : mode === "flashcards" ? (
        <Flashcards practice={practice} isDemo={isDemo} onSwitch={switchMode} onClose={close} />
      ) : mode === "mock" ? (
        <MockTest practice={practice} isDemo={isDemo} onSwitch={switchMode}
                  onRetry={() => setAttempt((a) => a + 1)} />
      ) : (
        <Quiz practice={practice} isDemo={isDemo} onSwitch={switchMode}
              onRetry={() => setAttempt((a) => a + 1)} />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Loading({ mode, title }: { mode: PracticeMode; title?: string }) {
  const t = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md }}>
      <ActivityIndicator size="large" color={t.color.text} />
      <Txt variant="bodyMd" center>
        {mode === "flashcards" ? "Writing your flashcards" : mode === "mock" ? "Setting your mock test" : "Writing your quiz"}
      </Txt>
      <Txt variant="small" tone="muted" center style={{ maxWidth: 300 }}>
        Samiksha AI is reading {title ? `"${title}"` : "the material"} and writing questions from it.
      </Txt>
      {slow ? (
        <Txt variant="caption" tone="subtle" center>A long document or a mock test can take up to a minute.</Txt>
      ) : null}
    </View>
  );
}

function GroundingNote({ practice }: { practice: Practice }) {
  return (
    <Row gap={space.sm} wrap style={{ marginBottom: space.md }}>
      <Badge label={GROUNDING_LABEL[practice.grounding]} tone="neutral" size="sm"
             icon={practice.grounding === "title_only" ? "information-circle-outline" : "document-text-outline"} />
      {practice.grounding === "title_only" ? (
        <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>
          The material's content could not be read, so these cover its topic.
        </Txt>
      ) : null}
    </Row>
  );
}

function OtherModes({ current, onSwitch }: { current: PracticeMode; onSwitch: (m: PracticeMode) => void }) {
  const others = (["quiz", "flashcards", "mock"] as PracticeMode[]).filter((m) => m !== current);
  return (
    <Row gap={space.sm} style={{ marginTop: space.md }}>
      {others.map((m) => (
        <Button key={m} label={MODE_LABEL[m]} variant="secondary" size="sm"
                icon={m === "flashcards" ? "albums-outline" : m === "mock" ? "timer-outline" : "help-circle-outline"}
                onPress={() => onSwitch(m)} style={{ flex: 1 }} />
      ))}
    </Row>
  );
}

function Option({
  text, index, state, onPress, disabled,
}: {
  text: string; index: number;
  state: "idle" | "chosen" | "correct" | "wrong" | "dimmed";
  onPress?: () => void; disabled?: boolean;
}) {
  const t = useTheme();
  const bg = state === "correct" ? t.color.successSoft
    : state === "wrong" ? t.color.dangerSoft
    : state === "chosen" ? t.color.bgInverse
    : t.color.bgElevated;
  const border = state === "correct" ? t.color.success
    : state === "wrong" ? t.color.danger
    : state === "chosen" ? t.color.text
    : t.color.border;
  const fg = state === "chosen" ? t.color.textInverse : t.color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Option ${String.fromCharCode(65 + index)}: ${text}`}
      style={{
        flexDirection: "row", alignItems: "flex-start", gap: space.md,
        padding: space.md, borderRadius: radius.md, backgroundColor: bg,
        borderWidth: 1.5, borderColor: border, opacity: state === "dimmed" ? 0.55 : 1,
      }}
    >
      <View style={{
        width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
        borderWidth: 1, borderColor: state === "chosen" ? t.color.textInverse : t.color.borderStrong,
      }}>
        {state === "correct" ? <Ionicons name="checkmark" size={15} color={t.color.success} />
          : state === "wrong" ? <Ionicons name="close" size={15} color={t.color.danger} />
          : <Txt variant="caption" style={{ color: fg }}>{String.fromCharCode(65 + index)}</Txt>}
      </View>
      <Txt variant="body" style={{ flex: 1, color: fg, lineHeight: 22 }}>{text}</Txt>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  QUIZ
// ─────────────────────────────────────────────────────────────────────────────
function Quiz({ practice, isDemo, onSwitch, onRetry }: {
  practice: Practice; isDemo: boolean; onSwitch: (m: PracticeMode) => void; onRetry: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const questions = practice.items as PracticeQuestion[];
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const started = useRef(Date.now());
  const done = answers.length === questions.length && chosen === null;
  const q = questions[index];

  const choose = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    Haptics.notificationAsync(i === q.answer_index
      ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
  };

  const next = () => {
    const all = [...answers, chosen as number];
    setAnswers(all);
    setChosen(null);
    if (index < questions.length - 1) {
      setIndex(index + 1);
    } else {
      const correct = all.filter((a, i) => a === questions[i].answer_index).length;
      recordPractice(isDemo, { questions: questions.length, correct, seconds: (Date.now() - started.current) / 1000 });
    }
  };

  if (done) {
    const correct = answers.filter((a, i) => a === questions[i].answer_index).length;
    const missed = questions.filter((qq, i) => answers[i] !== qq.answer_index);
    return (
      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.xxxl }}>
        <Result score={correct} total={questions.length} title={practice.title} />
        {missed.length ? (
          <Button
            label="Ask Samiksha AI about what I missed" icon="chatbubble-ellipses-outline" full
            style={{ marginTop: space.lg }}
            onPress={() => router.push({
              pathname: "/assistant",
              params: { prompt: `I got these wrong in a quiz on "${practice.material_title}". Help me understand them, one at a time:\n\n${missed.map((m) => `- ${m.question}`).join("\n")}` },
            })}
          />
        ) : null}
        <Button label="New quiz on this material" icon="refresh" variant="secondary" full
                style={{ marginTop: space.sm }} onPress={onRetry} />
        <OtherModes current="quiz" onSwitch={onSwitch} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: 140 }}>
        <GroundingNote practice={practice} />
        <Row justify="space-between" style={{ marginBottom: 6 }}>
          <Txt variant="overline" tone="muted">QUESTION {index + 1} OF {questions.length}</Txt>
          <Txt variant="caption" tone="subtle">
            {answers.filter((a, i) => a === questions[i].answer_index).length} correct
          </Txt>
        </Row>
        <ProgressBar value={(index + (chosen !== null ? 1 : 0)) / questions.length} height={5} />

        <Animated.View key={index} entering={FadeInDown.duration(260)}>
          <Txt variant="h3" style={{ marginTop: space.lg, lineHeight: 28 }}>{q.question}</Txt>
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            {q.options.map((o, i) => (
              <Option key={i} text={o} index={i} onPress={() => choose(i)} disabled={chosen !== null}
                      state={chosen === null ? "idle"
                        : i === q.answer_index ? "correct"
                        : i === chosen ? "wrong" : "dimmed"} />
            ))}
          </View>

          {chosen !== null ? (
            <Animated.View entering={FadeIn.duration(220)}>
              <Card level={1} tone="sunken" style={{ marginTop: space.lg }}>
                <Txt variant="overline" tone={chosen === q.answer_index ? "success" : "danger"}>
                  {chosen === q.answer_index ? "CORRECT" : "NOT QUITE"}
                </Txt>
                <Txt variant="body" style={{ marginTop: 6, lineHeight: 22 }}>{q.explanation}</Txt>
                {q.source_hint && q.source_hint !== "topic" ? (
                  <Txt variant="caption" tone="subtle" style={{ marginTop: space.sm }}>Source: {q.source_hint}</Txt>
                ) : null}
              </Card>
            </Animated.View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {chosen !== null ? (
        <BottomBar>
          <Button label={index < questions.length - 1 ? "Next question" : "See my score"}
                  iconRight="arrow-forward" full size="lg" onPress={next} />
        </BottomBar>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  FLASHCARDS
// ─────────────────────────────────────────────────────────────────────────────
function Flashcards({ practice, isDemo, onSwitch, onClose }: {
  practice: Practice; isDemo: boolean; onSwitch: (m: PracticeMode) => void; onClose: () => void;
}) {
  const t = useTheme();
  const all = practice.items as PracticeCard[];
  const [queue, setQueue] = useState<number[]>(() => all.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [round, setRound] = useState(1);
  const started = useRef(Date.now());

  const finishedRound = pos >= queue.length;
  const stillLearning = queue.filter((i) => !known.has(i));

  useEffect(() => {
    if (finishedRound && stillLearning.length === 0) {
      recordPractice(isDemo, { cards: all.length, cardsKnown: all.length, seconds: (Date.now() - started.current) / 1000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedRound]);

  const mark = (gotIt: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (gotIt) setKnown((k) => new Set(k).add(queue[pos]));
    setFlipped(false);
    setPos((p) => p + 1);
  };

  if (finishedRound) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.xxxl }}>
        <Card level={2} style={{ alignItems: "center", paddingVertical: space.xl }}>
          <Ionicons name={stillLearning.length ? "albums-outline" : "checkmark-done"} size={34} color={t.color.text} />
          <Txt variant="h2" style={{ marginTop: space.md }}>{known.size} of {all.length} known</Txt>
          <Txt variant="small" tone="muted" center style={{ marginTop: space.sm, maxWidth: 280 }}>
            {stillLearning.length
              ? `${stillLearning.length} card${stillLearning.length === 1 ? "" : "s"} still to learn. Going round again is what makes them stick.`
              : `Every card recalled${round > 1 ? ` after ${round} rounds` : ""}. Come back tomorrow — recalling after a gap is what fixes it in memory.`}
          </Txt>
        </Card>
        {stillLearning.length ? (
          <Button label={`Review ${stillLearning.length} again`} icon="repeat" full style={{ marginTop: space.lg }}
                  onPress={() => { setQueue(stillLearning); setPos(0); setRound((r) => r + 1); }} />
        ) : (
          <Button label="Done" icon="checkmark" full style={{ marginTop: space.lg }} onPress={onClose} />
        )}
        <OtherModes current="flashcards" onSwitch={onSwitch} />
      </ScrollView>
    );
  }

  const card = all[queue[pos]];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.base, flex: 1 }}>
        <GroundingNote practice={practice} />
        <Row justify="space-between" style={{ marginBottom: 6 }}>
          <Txt variant="overline" tone="muted">CARD {pos + 1} OF {queue.length}{round > 1 ? ` · ROUND ${round}` : ""}</Txt>
          <Txt variant="caption" tone="subtle">{known.size} known</Txt>
        </Row>
        <ProgressBar value={pos / queue.length} height={5} />

        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setFlipped((f) => !f); }}
          accessibilityRole="button"
          accessibilityLabel={flipped ? "Show question" : "Show answer"}
          style={{ flex: 1, marginTop: space.lg }}
        >
          <Animated.View key={`${pos}-${flipped}`} entering={FadeIn.duration(200)} style={{
            flex: 1, borderRadius: radius.xl, padding: space.xl, justifyContent: "center",
            backgroundColor: flipped ? t.color.bgInverse : t.color.bgElevated,
            borderWidth: 1.5, borderColor: flipped ? t.color.text : t.color.borderStrong,
          }}>
            <Txt variant="overline" style={{ color: flipped ? t.color.textInverse : t.color.textSubtle, marginBottom: space.md }}>
              {flipped ? "ANSWER" : "RECALL IT FIRST"}
            </Txt>
            <Txt variant={flipped ? "bodyLg" : "h2"} style={{ color: flipped ? t.color.textInverse : t.color.text, lineHeight: flipped ? 26 : 32 }}>
              {flipped ? card.back : card.front}
            </Txt>
            {!flipped ? (
              <Txt variant="caption" tone="subtle" style={{ marginTop: space.xl }}>Tap to see the answer</Txt>
            ) : null}
          </Animated.View>
        </Pressable>
      </View>

      <BottomBar>
        {flipped ? (
          <Row gap={space.sm}>
            <Button label="Still learning" variant="secondary" size="lg" style={{ flex: 1 }} onPress={() => mark(false)} />
            <Button label="Got it" icon="checkmark" size="lg" style={{ flex: 1 }} onPress={() => mark(true)} />
          </Row>
        ) : (
          <Button label="Show answer" icon="eye-outline" full size="lg" onPress={() => setFlipped(true)} />
        )}
      </BottomBar>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOCK TEST
// ─────────────────────────────────────────────────────────────────────────────
function MockTest({ practice, isDemo, onSwitch, onRetry }: {
  practice: Practice; isDemo: boolean; onSwitch: (m: PracticeMode) => void; onRetry: () => void;
}) {
  const t = useTheme();
  const questions = practice.items as PracticeQuestion[];
  const limit = practice.time_limit_seconds ?? questions.length * 60;
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [index, setIndex] = useState(0);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);

  const remaining = started ? Math.max(0, limit - Math.floor((now - started) / 1000)) : limit;

  const submit = useCallback(() => {
    if (submittedAt || !started) return;
    const at = Date.now();
    setSubmittedAt(at);
    const correct = answers.filter((a, i) => a === questions[i].answer_index).length;
    recordPractice(isDemo, { questions: questions.length, correct, seconds: (at - started) / 1000 });
  }, [answers, questions, isDemo, started, submittedAt]);

  useEffect(() => {
    if (!started || submittedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [started, submittedAt]);

  useEffect(() => {
    if (started && !submittedAt && remaining === 0) submit();
  }, [remaining, started, submittedAt, submit]);

  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const answered = answers.filter((a) => a !== null).length;

  if (!started) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.xxxl }}>
        <GroundingNote practice={practice} />
        <Card level={2} style={{ padding: space.lg }}>
          <Ionicons name="timer-outline" size={30} color={t.color.text} />
          <Txt variant="h2" style={{ marginTop: space.md }}>{practice.title}</Txt>
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Row gap={space.sm}><Ionicons name="list-outline" size={16} color={t.color.textMuted} /><Txt variant="body">{questions.length} questions</Txt></Row>
            <Row gap={space.sm}><Ionicons name="time-outline" size={16} color={t.color.textMuted} /><Txt variant="body">{Math.round(limit / 60)} minutes</Txt></Row>
            <Row gap={space.sm}><Ionicons name="eye-off-outline" size={16} color={t.color.textMuted} /><Txt variant="body">Answers revealed when you submit</Txt></Row>
          </View>
          <Txt variant="small" tone="muted" style={{ marginTop: space.lg, lineHeight: 20 }}>
            Treat it like the real thing: no notes, no going back to the material. The test submits itself when time runs out.
          </Txt>
        </Card>
        <Button label="Start mock test" icon="play" full size="lg" style={{ marginTop: space.lg }}
                onPress={() => { const s = Date.now(); setStarted(s); setNow(s); }} />
      </ScrollView>
    );
  }

  if (submittedAt) {
    const correct = answers.filter((a, i) => a === questions[i].answer_index).length;
    const took = Math.round((submittedAt - started) / 1000);
    return (
      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.xxxl }}>
        <Result score={correct} total={questions.length} title={practice.title}
                note={`Finished in ${Math.floor(took / 60)}m ${took % 60}s${remaining === 0 ? " — time ran out" : ""}`} />
        <Txt variant="overline" tone="muted" style={{ marginTop: space.xl, marginBottom: space.md }}>REVIEW</Txt>
        <View style={{ gap: space.md }}>
          {questions.map((q, i) => {
            const mine = answers[i];
            const ok = mine === q.answer_index;
            return (
              <Card key={i} level={1}>
                <Row gap={space.sm} align="flex-start">
                  <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={18}
                            color={ok ? t.color.success : t.color.danger} style={{ marginTop: 2 }} />
                  <Txt variant="bodyMd" style={{ flex: 1 }}>{i + 1}. {q.question}</Txt>
                </Row>
                {!ok ? (
                  <Txt variant="small" tone="muted" style={{ marginTop: space.sm }}>
                    Your answer: {mine === null ? "not answered" : q.options[mine]}
                  </Txt>
                ) : null}
                <Txt variant="small" style={{ marginTop: 4 }}>Correct: {q.options[q.answer_index]}</Txt>
                <Txt variant="caption" tone="muted" style={{ marginTop: space.sm, lineHeight: 18 }}>{q.explanation}</Txt>
              </Card>
            );
          })}
        </View>
        <Button label="Take another mock test" icon="refresh" full style={{ marginTop: space.lg }} onPress={onRetry} />
        <OtherModes current="mock" onSwitch={onSwitch} />
      </ScrollView>
    );
  }

  const q = questions[index];
  return (
    <View style={{ flex: 1 }}>
      <Row justify="space-between" style={{ paddingHorizontal: space.base, paddingVertical: space.sm, backgroundColor: t.color.bgSunken }}>
        <Row gap={6}>
          <Ionicons name="timer-outline" size={16} color={remaining < 60 ? t.color.danger : t.color.text} />
          <Txt variant="bodyMd" style={{ fontVariant: ["tabular-nums"], color: remaining < 60 ? t.color.danger : t.color.text }}>{clock}</Txt>
        </Row>
        <Txt variant="caption" tone="muted">{answered} of {questions.length} answered</Txt>
      </Row>

      <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: 160 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: space.md }}>
          {questions.map((_, i) => (
            <Pressable key={i} onPress={() => setIndex(i)} accessibilityLabel={`Question ${i + 1}`} style={{
              width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
              backgroundColor: i === index ? t.color.bgInverse : answers[i] !== null ? t.color.bgSunken : "transparent",
              borderWidth: 1, borderColor: i === index ? t.color.text : t.color.border,
            }}>
              <Txt variant="caption" style={{ color: i === index ? t.color.textInverse : t.color.text }}>{i + 1}</Txt>
            </Pressable>
          ))}
        </ScrollView>

        <Txt variant="overline" tone="muted">QUESTION {index + 1}</Txt>
        <Txt variant="h3" style={{ marginTop: space.sm, lineHeight: 28 }}>{q.question}</Txt>
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {q.options.map((o, i) => (
            <Option key={i} text={o} index={i} state={answers[index] === i ? "chosen" : "idle"}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setAnswers((a) => a.map((v, j) => (j === index ? i : v)));
                    }} />
          ))}
        </View>
      </ScrollView>

      <BottomBar>
        <Row gap={space.sm}>
          <Button label="Previous" variant="secondary" size="lg" style={{ flex: 1 }}
                  disabled={index === 0} onPress={() => setIndex((i) => i - 1)} />
          {index < questions.length - 1 ? (
            <Button label="Next" iconRight="arrow-forward" size="lg" style={{ flex: 1 }}
                    onPress={() => setIndex((i) => i + 1)} />
          ) : (
            <Button label="Submit" icon="checkmark-done" size="lg" style={{ flex: 1 }}
                    onPress={async () => {
                      const unanswered = questions.length - answered;
                      if (unanswered > 0) {
                        const ok = await confirmAsync({
                          title: "Submit the test?",
                          message: `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered.`,
                          confirmLabel: "Submit",
                        });
                        if (!ok) return;
                      }
                      submit();
                    }} />
          )}
        </Row>
      </BottomBar>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Result({ score, total, title, note }: { score: number; total: number; title: string; note?: string }) {
  const t = useTheme();
  const pct = total ? Math.round((score / total) * 100) : 0;
  const verdict = pct >= 80 ? "Strong — you have this." : pct >= 50 ? "Getting there. Review what you missed." : "Worth another pass through the material.";
  return (
    <Card level={2} style={{ alignItems: "center", paddingVertical: space.xl }}>
      <Txt variant="overline" tone="muted" center numberOfLines={2}>{title.toUpperCase()}</Txt>
      <Txt variant="display" style={{ marginTop: space.md }}>{score}/{total}</Txt>
      <Txt variant="bodyMd" style={{ marginTop: 4 }}>{pct}%</Txt>
      <View style={{ alignSelf: "stretch", marginTop: space.lg }}>
        <ProgressBar value={score / Math.max(1, total)} height={8} tone={pct >= 50 ? "success" : "danger"} />
      </View>
      <Txt variant="small" tone="muted" center style={{ marginTop: space.md }}>{verdict}</Txt>
      {note ? <Txt variant="caption" tone="subtle" center style={{ marginTop: 4 }}>{note}</Txt> : null}
    </Card>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{
      position: "absolute", left: 0, right: 0, bottom: 0,
      padding: space.base, paddingBottom: space.xl,
      backgroundColor: t.color.bgElevated,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
    }}>
      {children}
    </View>
  );
}
