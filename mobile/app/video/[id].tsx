import React, { useState } from "react";
import { View, useWindowDimensions, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Badge, IconButton, Divider, Button,
} from "../../src/components/ui";
import { DEMO_VIDEOS } from "../../src/lib/demo";

export default function VideoScreen() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const v = DEMO_VIDEOS.find((x) => x.youtube_id === id) ?? DEMO_VIDEOS[0];
  const playerHeight = Math.round(((width - space.base * 2) * 9) / 16);

  return (
    <Screen>
      <Row gap={space.md} style={{ marginTop: space.sm, marginBottom: space.base }}>
        <IconButton icon="chevron-back" tone="plain" onPress={() => router.back()} />
        <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>Tutoring video</Txt>
      </Row>

      {/* On web the YouTube iframe player renders natively; on device we use
          react-native-youtube-iframe. Both use the OFFICIAL embed — we never
          download or re-host streams. */}
      <View style={{
        height: playerHeight, borderRadius: radius.lg, overflow: "hidden",
        backgroundColor: "#000000", alignItems: "center", justifyContent: "center",
      }}>
        {Platform.OS === "web" ? (
          // @ts-ignore — iframe is valid on web
          <iframe
            width="100%" height="100%"
            src={`https://www.youtube.com/embed/${v.youtube_id}`}
            title={v.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <View style={{ alignItems: "center", gap: space.sm }}>
            <Ionicons name="play-circle" size={52} color="#FFFFFF" />
            <Txt variant="caption" style={{ color: "rgba(255,255,255,0.7)" }}>
              Official YouTube player
            </Txt>
          </View>
        )}
      </View>

      <Txt variant="h3" style={{ marginTop: space.base, lineHeight: 26 }}>{v.title}</Txt>
      <Row gap={space.sm} wrap style={{ marginTop: space.sm }}>
        <Badge label={v.channel_title} tone="neutral" size="sm" />
        <Badge label={`${Math.round(v.duration_seconds / 60)} min`} tone="neutral" size="sm" />
        <Badge label={v.competency_code} tone="primary" size="sm" />
      </Row>

      <Card level={1} tone="primary" style={{ marginTop: space.base }}>
        <Row justify="space-between" style={{ marginBottom: space.sm }}>
          <Row gap={6}>
            <Ionicons name="sparkles" size={13} color={t.color.primary} />
            <Txt variant="overline" tone="primary">WHY THIS VIDEO</Txt>
          </Row>
          <Badge label={`${Math.round(v.quality_score * 100)}% QUALITY`} tone="success" size="sm" />
        </Row>
        <Txt variant="small" tone="muted" style={{ lineHeight: 21 }}>{v.quality_rationale}</Txt>
      </Card>

      <Card level={1} style={{ marginTop: space.md }}>
        <Txt variant="caption" tone="subtle" style={{ lineHeight: 18 }}>
          Videos are surfaced via the official YouTube Data API and played through the
          official embedded player. Samiksha never downloads or re-hosts video content.
        </Txt>
      </Card>

      <Button label="Quiz yourself on this" icon="help-circle" full style={{ marginTop: space.xl }}
              onPress={() => router.push("/quiz/demo-quiz-01")} />
    </Screen>
  );
}
