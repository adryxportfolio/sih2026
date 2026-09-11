import React, { useState, useRef } from "react";
import { View, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius, type as typo } from "../src/theme";
import { Txt, Row, Card, Badge, IconButton, Divider } from "../src/components/ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
  citations?: { quote: string }[];
  followUps?: string[];
  confidence?: string;
}

const SEED: Msg[] = [
  {
    role: "assistant",
    content:
      "I can help with anything in your uploaded material — the NSS Methodology Handbook, the SQAF guidelines, or the imputation training note.\n\nI'll quote the source when the answer is in your documents, and tell you plainly when I'm answering from general knowledge instead.",
    confidence: "grounded",
    followUps: [
      "Why do I need weights from both stages?",
      "What does mean imputation do to variance?",
      "Explain secondary suppression",
    ],
  },
];

const CANNED: Record<string, Msg> = {
  default: {
    role: "assistant",
    content:
      "In a two-stage design the overall selection probability is the **product** of the two stage probabilities:\n\n`P(household) = P(village) × P(household | village)`\n\nThe design weight is its reciprocal. If you use only the second stage, you're implicitly assuming every village had an equal chance of selection — but under PPS they did not, so larger villages are over-represented in your estimate and nothing in the data will flag it.\n\nThis is the error I'd watch for in your profile specifically: your conceptual answers on stratification are correct, so the gap is procedural rather than a misunderstanding.",
    confidence: "grounded",
    citations: [{ quote: "The overall probability of selection in a multi-stage design is the product of the probabilities at each stage, and the design weight is its reciprocal." }],
    followUps: [
      "Work through a numerical example",
      "How does this affect variance estimation?",
    ],
  },
};

export default function Tutor() {
  const t = useTheme();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;
    setMessages((m) => [...m, { role: "user", content }]);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      setMessages((m) => [...m, CANNED.default]);
      setThinking(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }, 1100);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <Row justify="space-between" style={{ paddingHorizontal: space.base, paddingVertical: space.sm }}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <IconButton icon="chevron-back" tone="plain" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">AI Tutor</Txt>
            <Txt variant="overline" tone="subtle">GROUNDED IN YOUR MATERIAL</Txt>
          </View>
        </Row>
        <Badge label="RAG" tone="primary" size="sm" icon="documents" />
      </Row>
      <Divider />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: space.base, gap: space.md }}>
          {messages.map((m, i) => (
            <Animated.View key={i} entering={FadeInUp.duration(280)}>
              {m.role === "user" ? (
                <View style={{
                  alignSelf: "flex-end", maxWidth: "85%",
                  backgroundColor: t.color.primary, borderRadius: radius.lg,
                  borderBottomRightRadius: radius.xs, padding: space.md,
                }}>
                  <Txt variant="body" style={{ color: t.color.onPrimary, lineHeight: 22 }}>{m.content}</Txt>
                </View>
              ) : (
                <View style={{ maxWidth: "95%" }}>
                  <Card level={1}>
                    <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                      <View style={{
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: t.color.primary,
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Ionicons name="sparkles" size={11} color={t.color.onPrimary} />
                      </View>
                      {m.confidence ? (
                        <Badge
                          label={m.confidence === "grounded" ? "FROM YOUR MATERIAL" : "GENERAL KNOWLEDGE"}
                          tone={m.confidence === "grounded" ? "success" : "warning"}
                          size="sm"
                        />
                      ) : null}
                    </Row>
                    <Txt variant="body" style={{ lineHeight: 23 }}>{m.content}</Txt>

                    {m.citations?.length ? (
                      <View style={{
                        marginTop: space.md, padding: space.md,
                        borderRadius: radius.sm, backgroundColor: t.color.bgSunken,
                        borderLeftWidth: 3, borderLeftColor: t.color.success,
                      }}>
                        <Txt variant="overline" tone="success" style={{ marginBottom: 4 }}>SOURCE</Txt>
                        <Txt variant="small" tone="muted" style={{ fontStyle: "italic", lineHeight: 20 }}>
                          "{m.citations[0].quote}"
                        </Txt>
                      </View>
                    ) : null}
                  </Card>

                  {m.followUps?.length ? (
                    <View style={{ gap: space.sm, marginTop: space.sm }}>
                      {m.followUps.map((f) => (
                        <Pressable key={f} onPress={() => send(f)} style={{
                          paddingHorizontal: space.md, paddingVertical: space.sm,
                          borderRadius: radius.pill, backgroundColor: t.color.primarySoft,
                          borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.primary + "44",
                          alignSelf: "flex-start",
                        }}>
                          <Row gap={6}>
                            <Ionicons name="return-down-forward" size={12} color={t.color.primary} />
                            <Txt variant="small" tone="primary">{f}</Txt>
                          </Row>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              )}
            </Animated.View>
          ))}

          {thinking ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Card level={1} style={{ alignSelf: "flex-start" }}>
                <Row gap={space.sm}>
                  <Ionicons name="sparkles" size={14} color={t.color.primary} />
                  <Txt variant="small" tone="muted">Searching your material…</Txt>
                </Row>
              </Card>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View style={{
          padding: space.base, paddingBottom: space.lg,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
          backgroundColor: t.color.bgElevated,
        }}>
          <Row gap={space.sm}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your material…"
              placeholderTextColor={t.color.textSubtle}
              onSubmitEditing={() => send()}
              style={{
                flex: 1, height: 48, borderRadius: radius.pill,
                backgroundColor: t.color.bgSunken, paddingHorizontal: space.base,
                color: t.color.text, ...typo.body,
                borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
              }}
            />
            <Pressable onPress={() => send()} style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: input.trim() ? t.color.primary : t.color.bgSunken,
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="arrow-up" size={20}
                        color={input.trim() ? t.color.onPrimary : t.color.textSubtle} />
            </Pressable>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
