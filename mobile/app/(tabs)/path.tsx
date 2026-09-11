import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, ProgressBar, Divider, SectionHeader,
} from "../../src/components/ui";
import { DEMO_PATH } from "../../src/lib/demo";

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  course: "school", video: "play-circle", quiz: "help-circle",
  material: "document-text", flashcard_deck: "albums",
  practice: "construct", reflection: "create",
};

export default function PathScreen() {
  const t = useTheme();
  const router = useRouter();
  const [showWhy, setShowWhy] = useState(true);

  const done = DEMO_PATH.items.filter((i) => i.status === "completed").length;

  return (
    <Screen>
      <Row justify="space-between" align="flex-start" style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="primary">PERSONALISED PLAN</Txt>
          <Txt variant="h1" style={{ marginTop: 4 }}>{DEMO_PATH.title}</Txt>
        </View>
      </Row>

      {/* Progress summary */}
      <Card level={2}>
        <Row justify="space-between" style={{ marginBottom: space.md }}>
          <View>
            <Txt variant="h2">{done}<Txt variant="body" tone="muted"> / {DEMO_PATH.items.length}</Txt></Txt>
            <Txt variant="caption" tone="subtle">STEPS COMPLETE</Txt>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt variant="h2">{Math.round(DEMO_PATH.estimated_minutes / 60)}h</Txt>
            <Txt variant="caption" tone="subtle">TOTAL EFFORT</Txt>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt variant="h2">6</Txt>
            <Txt variant="caption" tone="subtle">WEEKS</Txt>
          </View>
        </Row>
        <ProgressBar value={done / DEMO_PATH.items.length} height={8} />
      </Card>

      {/* Why this plan — the explainability card */}
      <Card level={1} tone="primary" style={{ marginTop: space.md }}>
        <Pressable onPress={() => setShowWhy((s) => !s)}>
          <Row justify="space-between">
            <Row gap={space.sm}>
              <Ionicons name="sparkles" size={15} color={t.color.primary} />
              <Txt variant="bodyMd" tone="primary">Why this plan?</Txt>
            </Row>
            <Ionicons name={showWhy ? "chevron-up" : "chevron-down"} size={16} color={t.color.primary} />
          </Row>
        </Pressable>
        {showWhy ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <Txt variant="small" tone="muted" style={{ marginTop: space.md, lineHeight: 21 }}>
              {DEMO_PATH.rationale}
            </Txt>
            <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
              <Badge label="Spaced repetition" tone="primary" size="sm" icon="repeat" />
              <Badge label="Interleaving" tone="primary" size="sm" icon="shuffle" />
              <Badge label="Retrieval practice" tone="primary" size="sm" icon="refresh" />
            </Row>
          </Animated.View>
        ) : null}
      </Card>

      <SectionHeader title="Your steps" icon="list-outline" />

      {/* Timeline */}
      <View>
        {DEMO_PATH.items.map((item, i) => {
          const isDone = item.status === "completed";
          const isActive = item.status === "in_progress";
          const isLast = i === DEMO_PATH.items.length - 1;

          const dotColor = isDone ? t.color.success : isActive ? t.color.primary : t.color.border;

          return (
            <Animated.View key={item.id} entering={FadeInDown.delay(i * 45).duration(320)}>
              <Row align="flex-start" gap={space.md}>
                {/* Rail */}
                <View style={{ width: 28, alignItems: "center" }}>
                  <View style={{
                    width: 26, height: 26, borderRadius: 13,
                    backgroundColor: isDone ? t.color.success : isActive ? t.color.primary : t.color.bgSunken,
                    borderWidth: 2,
                    borderColor: isDone || isActive ? "transparent" : t.color.border,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {isDone
                      ? <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      : <Txt variant="overline" style={{
                          color: isActive ? t.color.onPrimary : t.color.textSubtle,
                        }}>{i + 1}</Txt>}
                  </View>
                  {!isLast ? (
                    <View style={{
                      width: 2, flex: 1, minHeight: 56,
                      backgroundColor: isDone ? t.color.success + "55" : t.color.border,
                    }} />
                  ) : null}
                </View>

                {/* Card */}
                <View style={{ flex: 1, paddingBottom: space.md }}>
                  <Card
                    level={isActive ? 2 : 1}
                    tone={isActive ? "primary" : "default"}
                    onPress={() => {
                      if (item.kind === "quiz") router.push("/quiz/demo-quiz-01");
                      else if (item.kind === "flashcard_deck") router.push("/review");
                    }}
                    style={isDone ? { opacity: 0.68 } : undefined}
                  >
                    <Row gap={space.sm} style={{ marginBottom: 6 }}>
                      <Ionicons name={KIND_ICON[item.kind] ?? "ellipse"} size={14} color={t.color.primary} />
                      <Txt variant="overline" tone="primary">{item.kind.replace("_", " ").toUpperCase()}</Txt>
                      <Txt variant="overline" tone="subtle">· {item.estimated_minutes} MIN</Txt>
                      {isActive ? <Badge label="NOW" tone="primary" size="sm" /> : null}
                    </Row>

                    <Txt variant="bodyMd" style={isDone ? { textDecorationLine: "line-through" } : undefined}>
                      {item.title}
                    </Txt>
                    <Txt variant="small" tone="muted" style={{ marginTop: 3 }}>{item.description}</Txt>

                    <View style={{
                      marginTop: space.sm, paddingTop: space.sm,
                      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
                    }}>
                      <Row gap={6} align="flex-start">
                        <Ionicons name="bulb-outline" size={12} color={t.color.textSubtle} style={{ marginTop: 2 }} />
                        <Txt variant="caption" tone="subtle" style={{ flex: 1, lineHeight: 17 }}>
                          {item.why_this}
                        </Txt>
                      </Row>
                    </View>

                    {item.provider ? (
                      <Row gap={5} style={{ marginTop: space.sm }}>
                        <Ionicons name="business-outline" size={11} color={t.color.textSubtle} />
                        <Txt variant="overline" tone="subtle">{item.provider} · via iGOT KARMAYOGI</Txt>
                      </Row>
                    ) : null}
                  </Card>
                </View>
              </Row>
            </Animated.View>
          );
        })}
      </View>

      <Button
        label="Regenerate plan"
        variant="secondary"
        icon="refresh"
        full
        style={{ marginTop: space.base }}
      />
      <Txt variant="caption" tone="subtle" center style={{ marginTop: space.sm }}>
        Re-runs gap analysis and re-sequences against your latest results.
      </Txt>
    </Screen>
  );
}
