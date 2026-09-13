import React from "react";
import { View, useWindowDimensions, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Badge, IconButton, Button,
} from "../../src/components/ui";
import { DEMO_VIDEOS } from "../../src/lib/demo";

// react-native-webview has no web implementation, so it is only required on
// device; the browser build uses a plain iframe instead.
const WebView = Platform.OS === "web" ? null : require("react-native-webview").WebView;

function embedHtml(id: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1"
allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></body></html>`;
}

export default function VideoScreen() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id, title, material } = useLocalSearchParams<{ id: string; title?: string; material?: string }>();
  // A curated tutoring video carries its quality rationale; one an
  // administrator assigned is shown as-is.
  const curated = DEMO_VIDEOS.find((x) => x.youtube_id === id);
  const videoId = String(id ?? curated?.youtube_id ?? DEMO_VIDEOS[0].youtube_id);
  const heading = curated?.title ?? (title ? String(title) : "Assigned video");
  const playerHeight = Math.round(((Math.min(width, 720) - space.base * 2) * 9) / 16);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return (
    <Screen>
      <Row gap={space.md} style={{ marginTop: space.sm, marginBottom: space.base }}>
        <IconButton icon="chevron-back" tone="plain" onPress={() => router.back()} accessibilityLabel="Back" />
        <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
          {curated ? "Tutoring video" : "From your department"}
        </Txt>
      </Row>

      {/* The official embedded player on every target — Samiksha never
          downloads or re-hosts video. */}
      <View style={{
        height: playerHeight, borderRadius: radius.lg, overflow: "hidden",
        backgroundColor: "#000000",
      }}>
        {Platform.OS === "web" ? (
          // @ts-ignore — iframe is valid on web
          <iframe
            width="100%" height="100%"
            src={`https://www.youtube.com/embed/${videoId}`}
            title={heading}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : WebView ? (
          <WebView
            source={{ html: embedHtml(videoId), baseUrl: "https://www.youtube-nocookie.com" }}
            style={{ flex: 1, backgroundColor: "#000000" }}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
          />
        ) : null}
      </View>

      <Txt variant="h3" style={{ marginTop: space.base, lineHeight: 26 }}>{heading}</Txt>
      {curated ? (
        <Row gap={space.sm} wrap style={{ marginTop: space.sm }}>
          <Badge label={curated.channel_title} tone="neutral" size="sm" />
          <Badge label={`${Math.round(curated.duration_seconds / 60)} min`} tone="neutral" size="sm" />
          <Badge label={curated.competency_code} tone="primary" size="sm" />
        </Row>
      ) : null}

      {curated ? (
        <Card level={1} tone="primary" style={{ marginTop: space.base }}>
          <Row justify="space-between" style={{ marginBottom: space.sm }}>
            <Row gap={6}>
              <Ionicons name="sparkles" size={13} color={t.color.primary} />
              <Txt variant="overline" tone="primary">WHY THIS VIDEO</Txt>
            </Row>
            <Badge label={`${Math.round(curated.quality_score * 100)}% QUALITY`} tone="success" size="sm" />
          </Row>
          <Txt variant="small" tone="muted" style={{ lineHeight: 21 }}>{curated.quality_rationale}</Txt>
        </Card>
      ) : null}

      <Row gap={space.sm} wrap style={{ marginTop: space.base }}>
        <Button label="Open in YouTube" variant="secondary" size="sm" icon="logo-youtube"
                onPress={() => WebBrowser.openBrowserAsync(watchUrl).catch(() => {})} />
        <Button label="Ask about this video" variant="secondary" size="sm" icon="chatbubble-ellipses-outline"
                onPress={() => router.push({
                  pathname: "/assistant",
                  params: { prompt: `I just watched "${heading}". Check my understanding with one question on its key idea.` },
                })} />
      </Row>

      {material ? (
        <Card level={1} tone="sunken" style={{ marginTop: space.base }}>
          <Txt variant="overline" tone="muted">PRACTISE ON THIS VIDEO</Txt>
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            {([["quiz", "Quiz", "help-circle-outline"], ["flashcards", "Flashcards", "albums-outline"],
               ["mock", "Mock test", "timer-outline"]] as const).map(([mode, label, icon]) => (
              <Button key={mode} label={label} icon={icon} size="sm" variant={mode === "quiz" ? "primary" : "secondary"}
                      style={{ flex: 1 }}
                      onPress={() => router.push({ pathname: "/practice", params: { id: String(material), mode } })} />
            ))}
          </Row>
        </Card>
      ) : null}

      <Card level={1} style={{ marginTop: space.md }}>
        <Txt variant="caption" tone="subtle" style={{ lineHeight: 18 }}>
          Videos play through YouTube's official embedded player. Samiksha never downloads or
          re-hosts video content.
        </Txt>
      </Card>

      {curated ? (
        <Button label="Quiz yourself on this" icon="help-circle" full style={{ marginTop: space.xl }}
                onPress={() => router.push("/quiz/demo-quiz-01")} />
      ) : null}
    </Screen>
  );
}
