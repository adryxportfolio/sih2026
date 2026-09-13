/**
 * Samiksha AI.
 *
 * One screen, two jobs, decided by who is signed in:
 *   · an officer asks questions and clears doubts, against their own gaps and
 *     the material their department assigned them;
 *   · an administrator asks for data and hands over tasks. Anything that would
 *     change the platform is shown as an action card and only runs when they
 *     confirm it — the assistant drafts, the administrator decides.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Text,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme, space, radius, type as typo } from "../src/theme";
import { Txt, Row, Card, Badge, IconButton, Divider, Button } from "../src/components/ui";
import { useSession } from "../src/store/session";
import {
  askAssistant, confirmAssistantAction, type ChatTurn, type AssistantMode,
} from "../src/lib/assistant";
import { applyDemoAssistantEffect } from "../src/lib/materials";

const STARTERS: Record<AssistantMode, string[]> = {
  learner: [
    "Why does a two-stage sample need weights from both stages?",
    "When is median imputation better than mean imputation?",
    "What should I study first this week?",
  ],
  admin: [
    "Which officers have critical gaps right now?",
    "Where is the workforce weakest overall?",
    "Who hasn't opened the material we published?",
  ],
};

const INTRO: Record<AssistantMode, string> = {
  learner:
    "Ask me anything you are stuck on — a concept from your training, a step in a method, or something in the material your department assigned. I know where your plan says you need to grow, so I will connect answers to that.",
  admin:
    "Ask me for numbers about your officers, departments and training, or give me a task — publishing a video to a department, provisioning an account, resetting a password. I will show you exactly what I am about to do before anything changes.",
};

export default function Assistant() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const { isAdmin, isDemo, profile, setActivity } = useSession();
  const mode: AssistantMode = isAdmin ? "admin" : "learner";

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sentPrompt = useRef(false);

  useEffect(() => { setActivity("tutor", "Samiksha AI"); }, [setActivity]);

  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    const history: ChatTurn[] = [...turns, { role: "user", content }];
    setTurns(history);
    setInput("");
    setThinking(true);
    scrollDown();
    try {
      const r = await askAssistant({ mode, history, isDemo });
      setTurns((prev) => [...prev, {
        role: "assistant",
        content: r.reply,
        pending: r.pending_action,
        actionState: r.pending_action ? "proposed" : undefined,
      }]);
    } catch (e) {
      setTurns((prev) => [...prev, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally {
      setThinking(false);
      scrollDown();
    }
  };

  // Arriving with a question already chosen — from a Library card or a tip.
  useEffect(() => {
    if (prompt && !sentPrompt.current) {
      sentPrompt.current = true;
      send(String(prompt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const setActionState = (index: number, actionState: ChatTurn["actionState"]) =>
    setTurns((prev) => prev.map((turn, i) => (i === index ? { ...turn, actionState } : turn)));

  const confirm = async (index: number) => {
    const action = turns[index]?.pending;
    if (!action) return;
    setActionState(index, "running");
    try {
      const r = await confirmAssistantAction({ action, isDemo });
      if (r.demo_effect) await applyDemoAssistantEffect(r.demo_effect.tool, r.demo_effect.args);
      setActionState(index, "done");
      setTurns((prev) => [...prev, { role: "assistant", content: r.reply }]);
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["officers"] });
    } catch (e) {
      setActionState(index, "proposed");
      setTurns((prev) => [...prev, { role: "assistant", content: (e as Error).message, error: true }]);
    }
    scrollDown();
  };

  const cancel = (index: number) => {
    setActionState(index, "cancelled");
    setTurns((prev) => [...prev, { role: "assistant", content: "Cancelled — nothing was changed." }]);
    scrollDown();
  };

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <Row justify="space-between" style={{ paddingHorizontal: space.base, paddingVertical: space.sm }}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <IconButton icon="chevron-back" tone="plain" accessibilityLabel="Back"
                      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Samiksha AI</Txt>
            <Txt variant="overline" tone="subtle">
              {mode === "admin" ? "DATA AND TASKS" : "ASK A QUESTION"}
            </Txt>
          </View>
        </Row>
        {turns.length ? (
          <IconButton icon="create-outline" tone="plain" accessibilityLabel="New conversation"
                      onPress={() => { setTurns([]); setInput(""); }} />
        ) : null}
      </Row>
      <Divider />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: space.base, gap: space.md, paddingBottom: space.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intro */}
          <Animated.View entering={FadeIn.duration(300)}>
            <Card level={1}>
              <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13, backgroundColor: t.color.primary,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name="sparkles" size={13} color={t.color.onPrimary} />
                </View>
                <Txt variant="bodyMd">{firstName ? `Hello, ${firstName}` : "Hello"}</Txt>
              </Row>
              <Txt variant="body" tone="muted" style={{ lineHeight: 22 }}>{INTRO[mode]}</Txt>
            </Card>
            {!turns.length ? (
              <View style={{ gap: space.sm, marginTop: space.md }}>
                {STARTERS[mode].map((s) => (
                  <Pressable key={s} onPress={() => send(s)} style={{
                    paddingHorizontal: space.md, paddingVertical: space.sm + 2,
                    borderRadius: radius.md, backgroundColor: t.color.bgSunken,
                    borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
                  }}>
                    <Row gap={space.sm}>
                      <Ionicons name="return-down-forward" size={13} color={t.color.textMuted} />
                      <Txt variant="small" style={{ flex: 1 }}>{s}</Txt>
                    </Row>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Animated.View>

          {turns.map((m, i) => (
            <Animated.View key={i} entering={FadeInUp.duration(260)}>
              {m.role === "user" ? (
                <View style={{
                  alignSelf: "flex-end", maxWidth: "86%",
                  backgroundColor: t.color.primary, borderRadius: radius.lg,
                  borderBottomRightRadius: radius.xs, padding: space.md,
                }}>
                  <Txt variant="body" style={{ color: t.color.onPrimary, lineHeight: 22 }}>{m.content}</Txt>
                </View>
              ) : (
                <View style={{ maxWidth: "96%", gap: space.sm }}>
                  <Card level={1} style={m.error ? { borderColor: t.color.borderStrong } : undefined}>
                    {m.error ? (
                      <Row gap={space.sm} style={{ marginBottom: 6 }}>
                        <Ionicons name="alert-circle-outline" size={15} color={t.color.textMuted} />
                        <Txt variant="overline" tone="subtle">COULD NOT ANSWER</Txt>
                      </Row>
                    ) : null}
                    <RichText text={m.content} />
                  </Card>

                  {m.pending ? (
                    <Card level={2} tone="sunken" style={{ borderWidth: 1, borderColor: t.color.borderStrong }}>
                      <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                        <Ionicons name="flash-outline" size={14} color={t.color.text} />
                        <Txt variant="overline">
                          {m.actionState === "done" ? "DONE"
                            : m.actionState === "cancelled" ? "CANCELLED"
                            : "NEEDS YOUR CONFIRMATION"}
                        </Txt>
                      </Row>
                      <Txt variant="bodyMd" style={{ lineHeight: 22 }}>{m.pending.summary}</Txt>
                      {m.actionState === "proposed" || m.actionState === "running" ? (
                        <Row gap={space.sm} style={{ marginTop: space.md }}>
                          <Button label="Confirm" icon="checkmark" size="sm"
                                  loading={m.actionState === "running"}
                                  onPress={() => confirm(i)} />
                          <Button label="Cancel" variant="secondary" size="sm"
                                  disabled={m.actionState === "running"}
                                  onPress={() => cancel(i)} />
                        </Row>
                      ) : null}
                    </Card>
                  ) : null}
                </View>
              )}
            </Animated.View>
          ))}

          {thinking ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Card level={1} style={{ alignSelf: "flex-start" }}>
                <Row gap={space.sm}>
                  <Ionicons name="sparkles" size={14} color={t.color.text} />
                  <Txt variant="small" tone="muted">
                    {mode === "admin" ? "Looking at your data…" : "Thinking…"}
                  </Txt>
                </Row>
              </Card>
            </Animated.View>
          ) : null}

          {isDemo ? (
            <Row gap={6} justify="center" style={{ marginTop: space.sm }}>
              <Badge label="DEMO DATA" tone="neutral" size="sm" icon="flask-outline" />
            </Row>
          ) : null}
        </ScrollView>

        <View style={{
          padding: space.base, paddingBottom: space.lg,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
          backgroundColor: t.color.bgElevated,
        }}>
          <Row gap={space.sm} align="flex-end">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={mode === "admin" ? "Ask for data or give a task…" : "Ask a question…"}
              placeholderTextColor={t.color.textSubtle}
              multiline
              onKeyPress={(e: any) => {
                // Enter sends on web; Shift+Enter keeps a newline.
                if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
                  e.preventDefault?.();
                  send();
                }
              }}
              style={{
                flex: 1, minHeight: 48, maxHeight: 120, borderRadius: radius.lg,
                backgroundColor: t.color.bgSunken, paddingHorizontal: space.base,
                paddingTop: 13, paddingBottom: 13,
                color: t.color.text, ...typo.body,
                borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
              }}
            />
            <Pressable
              onPress={() => send()}
              disabled={!input.trim() || thinking}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={{
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: input.trim() && !thinking ? t.color.primary : t.color.bgSunken,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Ionicons name="arrow-up" size={20}
                        color={input.trim() && !thinking ? t.color.onPrimary : t.color.textSubtle} />
            </Pressable>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The model is asked for plain text, but emphasis markers still slip through.
 * Render **bold** and `code` rather than showing the punctuation.
 */
function RichText({ text }: { text: string }) {
  const t = useTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <Text style={[typo.body, { color: t.color.text, lineHeight: 23 }]}>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <Text key={i} style={{ fontWeight: "700" }}>{p.slice(2, -2)}</Text>;
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return <Text key={i} style={[typo.mono, { backgroundColor: t.color.bgSunken }]}>{p.slice(1, -1)}</Text>;
        }
        return <Text key={i}>{p.replace(/^#{1,6}\s+/gm, "")}</Text>;
      })}
    </Text>
  );
}
