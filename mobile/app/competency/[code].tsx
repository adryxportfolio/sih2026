import React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, LevelBadge, Divider, SectionHeader, IconButton, ProgressBar,
} from "../../src/components/ui";
import { GapBar } from "../../src/components/charts";
import { DEMO_COMPETENCIES, DEMO_VIDEOS } from "../../src/lib/demo";

const LEVELS = ["Unskilled", "Beginner", "Practitioner", "Proficient", "Expert"];

export default function CompetencyDetail() {
  const t = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const c = DEMO_COMPETENCIES.find((x) => x.code === code) ?? DEMO_COMPETENCIES[0];
  const videos = DEMO_VIDEOS.filter((v) => v.competency_code === c.code);
  const met = c.current >= c.required;

  return (
    <Screen>
      <Row gap={space.md} style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <IconButton icon="chevron-back" tone="plain" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="primary">{c.code} · {c.comp_type.toUpperCase()}</Txt>
          <Txt variant="h2" style={{ marginTop: 3 }}>{c.name}</Txt>
        </View>
      </Row>

      <Animated.View entering={FadeInDown.duration(360)}>
        <Card level={2}>
          <Row justify="space-between" style={{ marginBottom: space.md }}>
            <View>
              <Txt variant="overline" tone="subtle">YOUR LEVEL</Txt>
              <View style={{ marginTop: 5 }}><LevelBadge level={c.current} /></View>
            </View>
            <Ionicons name="arrow-forward" size={18} color={t.color.textSubtle} />
            <View style={{ alignItems: "flex-end" }}>
              <Txt variant="overline" tone="subtle">REQUIRED</Txt>
              <Txt variant="bodyMd" style={{ marginTop: 5 }}>{LEVELS[c.required]}</Txt>
            </View>
          </Row>

          <GapBar current={c.current} required={c.required} height={12} />

          <Row justify="space-between" style={{ marginTop: space.md }}>
            <Row gap={space.sm}>
              <Badge label={`${c.evidence} items assessed`} tone="neutral" size="sm" />
              {c.is_critical ? <Badge label="CRITICAL" tone="danger" size="sm" /> : null}
            </Row>
            <Badge
              label={met ? "MET" : `GAP ${(c.required - c.current).toFixed(1)}`}
              tone={met ? "success" : "danger"}
              size="sm"
            />
          </Row>

          <Divider style={{ marginVertical: space.md }} />
          <Row justify="space-between" style={{ marginBottom: 6 }}>
            <Txt variant="small" tone="muted">Measurement confidence</Txt>
            <Txt variant="small" tone={c.confidence > 0.6 ? "success" : "warning"}>
              {Math.round(c.confidence * 100)}%
            </Txt>
          </Row>
          <ProgressBar value={c.confidence} height={6} tone={c.confidence > 0.6 ? "success" : "warning"} />
          {c.confidence < 0.5 ? (
            <Txt variant="caption" tone="subtle" style={{ marginTop: space.sm, lineHeight: 17 }}>
              Low confidence means we don't have enough evidence to judge this yet.
              That's a measurement gap, not necessarily a skill gap.
            </Txt>
          ) : null}
        </Card>
      </Animated.View>

      {c.rationale ? (
        <Animated.View entering={FadeInDown.delay(80).duration(360)}>
          <SectionHeader title="AI diagnosis" icon="sparkles-outline" />
          <Card level={1} tone="primary">
            <Txt variant="body" tone="muted" style={{ lineHeight: 23 }}>{c.rationale}</Txt>
          </Card>
        </Animated.View>
      ) : null}

      {videos.length ? (
        <Animated.View entering={FadeInDown.delay(140).duration(360)}>
          <SectionHeader title="Recommended videos" icon="play-circle-outline" />
          <View style={{ gap: space.md }}>
            {videos.map((v) => (
              <Card key={v.id} level={1} onPress={() => router.push(`/video/${v.youtube_id}`)}>
                <Row gap={space.md}>
                  <View style={{
                    width: 62, height: 44, borderRadius: radius.sm,
                    backgroundColor: t.color.bgSunken,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Ionicons name="play" size={18} color={t.color.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyMd" numberOfLines={2}>{v.title}</Txt>
                    <Txt variant="overline" tone="subtle" style={{ marginTop: 3 }}>
                      {Math.round(v.duration_seconds / 60)} MIN · AI SCORE {Math.round(v.quality_score * 100)}%
                    </Txt>
                  </View>
                </Row>
              </Card>
            ))}
          </View>
        </Animated.View>
      ) : null}

      <Row gap={space.md} style={{ marginTop: space.xl }}>
        <Button label="Practice" icon="help-circle" style={{ flex: 1 }}
                onPress={() => router.push("/quiz/demo-quiz-01")} />
        <Button label="Review cards" variant="secondary" icon="albums" style={{ flex: 1 }}
                onPress={() => router.push("/review")} />
      </Row>
    </Screen>
  );
}
