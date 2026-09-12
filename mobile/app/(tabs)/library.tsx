import React, { useState } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, SectionHeader, Chip, Divider, EmptyState,
} from "../../src/components/ui";
import { DEMO_QUIZ, DEMO_VIDEOS, DEMO_CARDS } from "../../src/lib/demo";
import { notify } from "../../src/lib/dialog";
import { useSession } from "../../src/store/session";

type Tab = "materials" | "quizzes" | "videos" | "decks";

const DEMO_MATERIALS = [
  { id: "m1", title: "NSS Survey Methodology Handbook", pages: 148, words: 52400,
    status: "ready", topics: ["Sampling", "Weights", "Estimation"], chunks: 61, uploaded: "2 days ago" },
  { id: "m2", title: "SQAF Guidelines 2024 (scanned)", pages: 32, words: 11200,
    status: "ready", topics: ["Quality", "SQAF"], chunks: 14, uploaded: "5 days ago", ocr: true },
  { id: "m3", title: "Imputation Methods — Training Note", pages: 18, words: 6800,
    status: "ready", topics: ["Imputation", "Missing data"], chunks: 9, uploaded: "1 week ago" },
];

export default function Library() {
  const t = useTheme();
  const router = useRouter();
  const { isDemo } = useSession();
  const [tab, setTab] = useState<Tab>("materials");
  const [uploading, setUploading] = useState(false);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      setUploading(true);
      setTimeout(() => {
        setUploading(false);
        notify(
          "Demo mode",
          isDemo
            ? "In demo mode uploads aren't sent anywhere. With Supabase connected, this file would be extracted (with vision OCR if it's a scan), chunked, embedded, and turned into a competency-tagged quiz."
            : "Upload received. Processing will begin shortly.",
        );
      }, 1400);
    } catch {
      setUploading(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <Txt variant="overline" tone="primary">YOUR CONTENT</Txt>
        <Txt variant="h1" style={{ marginTop: 4 }}>Library</Txt>
      </View>

      {/* Upload CTA */}
      <Animated.View entering={FadeInDown.duration(360)}>
        <Card level={2} tone="primary" onPress={uploading ? undefined : pickFile}
              style={{ borderStyle: "dashed", borderWidth: 1.5, borderColor: t.color.primary + "55" }}>
          <Row gap={space.md}>
            <View style={{
              width: 46, height: 46, borderRadius: radius.md,
              backgroundColor: t.color.primary, alignItems: "center", justifyContent: "center",
            }}>
              {uploading
                ? <ActivityIndicator color={t.color.onPrimary} />
                : <Ionicons name="cloud-upload" size={22} color={t.color.onPrimary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyMd">{uploading ? "Processing…" : "Upload learning material"}</Txt>
              <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                PDF, scans or images → quiz, flashcards and a tutor that cites it
              </Txt>
            </View>
          </Row>
          {!uploading ? (
            <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
              <Badge label="Vision OCR for scans" tone="primary" size="sm" icon="scan" />
              <Badge label="Auto competency tagging" tone="primary" size="sm" icon="pricetag" />
            </Row>
          ) : null}
        </Card>
      </Animated.View>

      {/* Tabs */}
      <Row gap={space.sm} wrap style={{ marginTop: space.lg, marginBottom: space.md }}>
        {([
          ["materials", "Materials", DEMO_MATERIALS.length],
          ["quizzes", "Quizzes", 4],
          ["videos", "Videos", DEMO_VIDEOS.length],
          ["decks", "Decks", 3],
        ] as [Tab, string, number][]).map(([k, label, n]) => (
          <Chip key={k} label={`${label} ${n}`} selected={tab === k} onPress={() => setTab(k)} />
        ))}
      </Row>

      {tab === "materials" ? (
        <View style={{ gap: space.md }}>
          {DEMO_MATERIALS.map((m, i) => (
            <Animated.View key={m.id} entering={FadeInDown.delay(i * 50).duration(320)}>
              <Card level={1}>
                <Row gap={space.md} align="flex-start">
                  <View style={{
                    width: 42, height: 42, borderRadius: radius.sm,
                    backgroundColor: t.color.primarySoft,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Ionicons name="document-text" size={20} color={t.color.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyMd" numberOfLines={2}>{m.title}</Txt>
                    <Row gap={space.sm} wrap style={{ marginTop: 4 }}>
                      <Txt variant="overline" tone="subtle">{m.pages} PAGES</Txt>
                      <Txt variant="overline" tone="subtle">· {m.chunks} CHUNKS</Txt>
                      <Txt variant="overline" tone="subtle">· {m.uploaded.toUpperCase()}</Txt>
                    </Row>
                  </View>
                  <Badge label="READY" tone="success" size="sm" />
                </Row>

                <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
                  {m.ocr ? <Badge label="OCR" tone="warning" size="sm" icon="scan" /> : null}
                  {m.topics.map((x) => <Badge key={x} label={x} tone="neutral" size="sm" />)}
                </Row>

                <Divider style={{ marginVertical: space.md }} />

                <Row gap={space.sm}>
                  <Button label="Quiz" size="sm" icon="help-circle"
                          onPress={() => router.push("/quiz/demo-quiz-01")} />
                  <Button label="Cards" size="sm" variant="secondary" icon="albums"
                          onPress={() => router.push("/review")} />
                  <Button label="Ask" size="sm" variant="ghost" icon="chatbubbles"
                          onPress={() => router.push("/tutor")} />
                </Row>
              </Card>
            </Animated.View>
          ))}
        </View>
      ) : null}

      {tab === "quizzes" ? (
        <View style={{ gap: space.md }}>
          <Animated.View entering={FadeInDown.duration(320)}>
            <Card level={1} onPress={() => router.push("/quiz/demo-quiz-01")}>
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1, marginRight: space.sm }}>
                  <Txt variant="bodyMd">{DEMO_QUIZ.title}</Txt>
                  <Txt variant="caption" tone="muted" style={{ marginTop: 3 }}>{DEMO_QUIZ.description}</Txt>
                </View>
                <Badge label="AI" tone="primary" size="sm" icon="sparkles" />
              </Row>
              <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
                <Badge label={`${DEMO_QUIZ.questions.length} questions`} tone="neutral" size="sm" />
                <Badge label="100% grounded" tone="success" size="sm" icon="shield-checkmark" />
                <Badge label="Bloom spread" tone="neutral" size="sm" />
              </Row>
              <Button label="Start quiz" size="sm" icon="play" style={{ marginTop: space.md }}
                      onPress={() => router.push("/quiz/demo-quiz-01")} />
            </Card>
          </Animated.View>
          <EmptyState compact icon="add-circle-outline" title="Generate more"
                      body="Upload a material and we'll write a competency-tagged quiz from it."
                      actionLabel="Upload" onAction={pickFile} />
        </View>
      ) : null}

      {tab === "videos" ? (
        <View style={{ gap: space.md }}>
          {DEMO_VIDEOS.map((v, i) => (
            <Animated.View key={v.id} entering={FadeInDown.delay(i * 50).duration(320)}>
              <Card level={1} onPress={() => router.push(`/video/${v.youtube_id}`)}>
                <Row gap={space.md} align="flex-start">
                  <View style={{
                    width: 74, height: 50, borderRadius: radius.sm,
                    backgroundColor: t.color.bgSunken,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Ionicons name="play-circle" size={26} color={t.color.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyMd" numberOfLines={2}>{v.title}</Txt>
                    <Txt variant="overline" tone="subtle" style={{ marginTop: 3 }}>
                      {v.channel_title.toUpperCase()} · {Math.round(v.duration_seconds / 60)} MIN
                    </Txt>
                  </View>
                </Row>
                <View style={{
                  marginTop: space.md, padding: space.md,
                  borderRadius: radius.sm, backgroundColor: t.color.bgSunken,
                }}>
                  <Row justify="space-between" style={{ marginBottom: 5 }}>
                    <Row gap={5}>
                      <Ionicons name="sparkles" size={11} color={t.color.primary} />
                      <Txt variant="overline" tone="primary">AI QUALITY GATE</Txt>
                    </Row>
                    <Txt variant="caption" tone="success">{Math.round(v.quality_score * 100)}%</Txt>
                  </Row>
                  <Txt variant="caption" tone="muted" style={{ lineHeight: 17 }}>
                    {v.quality_rationale}
                  </Txt>
                </View>
              </Card>
            </Animated.View>
          ))}
        </View>
      ) : null}

      {tab === "decks" ? (
        <View style={{ gap: space.md }}>
          <Card level={1} onPress={() => router.push("/review")}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Txt variant="bodyMd">Design Weights — Active Recall</Txt>
                <Txt variant="caption" tone="muted" style={{ marginTop: 3 }}>
                  {DEMO_CARDS.length} cards · {DEMO_CARDS.filter((c) => c.due <= 0).length} due now
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.color.textSubtle} />
            </Row>
            <Row gap={space.sm} style={{ marginTop: space.md }}>
              <Badge label="FSRS-6" tone="primary" size="sm" icon="repeat" />
              <Badge label="90% retention target" tone="neutral" size="sm" />
            </Row>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
