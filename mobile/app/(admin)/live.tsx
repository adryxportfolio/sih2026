/**
 * Live board.
 *
 * Who is using the platform right now, and what they are doing. Backed by the
 * `user_presence` table with Supabase Realtime on top, so a change pushes
 * rather than waiting for a poll.
 *
 * Presence is derived from a heartbeat timestamp rather than a socket, which
 * matters on mobile: a phone that loses signal mid-session would otherwise sit
 * in the list as "online" indefinitely and quietly corrupt every engagement
 * figure an administrator reads.
 */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius, elevation } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Badge, Divider, SectionHeader, EmptyState, Loading,
} from "../../src/components/ui";
import { Appear, CountUp, Pulse } from "../../src/components/motion";
import { useSession } from "../../src/store/session";
import { supabase } from "../../src/lib/supabase";
import { listOfficers, type OfficerOverview } from "../../src/lib/api";
import { DEMO_ACTIVITY_FEED } from "../../src/lib/demo";

const ACTIVITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  reviewing: "albums", quiz: "help-circle", reading: "document-text",
  video: "play-circle", tutor: "chatbubbles", assessment: "clipboard",
  browsing: "compass", idle: "ellipse-outline",
};

const ACTIVITY_LABEL: Record<string, string> = {
  reviewing: "Reviewing flashcards", quiz: "Taking a quiz", reading: "Reading material",
  video: "Watching a video", tutor: "With the AI tutor", assessment: "In an assessment",
  browsing: "Browsing", idle: "Idle",
};

export default function Live() {
  const t = useTheme();
  const router = useRouter();
  const { isDemo, loading: sessionLoading } = useSession();

  const [officers, setOfficers] = useState<OfficerOverview[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const load = useCallback(async () => {
    try { setOfficers(await listOfficers(isDemo)); setLastUpdate(Date.now()); }
    catch { setOfficers([]); }
  }, [isDemo]);

  useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [load, sessionLoading]);

  // Realtime: push on any presence change, plus a slow poll as a safety net
  // for the case where the socket drops silently.
  useEffect(() => {
    if (isDemo || sessionLoading) return;

    const channel = supabase
      .channel("admin-presence")
      .on("postgres_changes",
          { event: "*", schema: "public", table: "user_presence" },
          () => load())
      .subscribe();

    const poll = setInterval(load, 60_000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [isDemo, sessionLoading, load]);

  const { online, away, offline } = useMemo(() => {
    const l = officers ?? [];
    return {
      online:  l.filter((o) => o.presence === "online"),
      away:    l.filter((o) => o.presence === "away"),
      offline: l.filter((o) => o.presence === "offline"),
    };
  }, [officers]);

  const studyingNow = online.filter((o) =>
    o.current_activity && !["idle", "browsing"].includes(o.current_activity));

  return (
    <Screen refreshControl={
      <RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
        tintColor={t.color.text} />
    }>
      <Row justify="space-between" align="flex-start" style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="muted">REAL TIME</Txt>
          <Txt variant="h1" style={{ marginTop: 2 }}>Live board</Txt>
        </View>
        <Pulse active={online.length > 0}>
          <Row gap={6} style={{
            height: 32, paddingHorizontal: space.md, borderRadius: radius.pill,
            backgroundColor: t.color.bgSunken, alignItems: "center",
          }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: online.length ? t.color.success : t.color.border,
            }} />
            <Txt variant="caption" tone="muted">{online.length ? "LIVE" : "QUIET"}</Txt>
          </Row>
        </Pulse>
      </Row>

      {officers === null ? <Loading label="Connecting…" /> : null}

      {/* ── Counts ──────────────────────────────────────────────────────── */}
      {officers !== null ? (
        <Appear from="scale">
          <View style={{
            borderRadius: radius.xl, padding: space.lg,
            backgroundColor: t.color.bgInverse, ...elevation(3, t.color.shadow),
          }}>
            <Row justify="space-between" align="flex-end">
              <View>
                <Txt variant="overline" style={{ color: t.dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }}>
                  STUDYING RIGHT NOW
                </Txt>
                <CountUp value={studyingNow.length} variant="display"
                         style={{ color: t.color.textInverse }} />
              </View>
              <Row gap={space.lg} style={{ marginBottom: 8 }}>
                <View style={{ alignItems: "center" }}>
                  <Txt variant="h3" style={{ color: t.color.textInverse }}>{online.length}</Txt>
                  <Txt variant="overline" style={{ color: t.dark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)" }}>
                    ONLINE
                  </Txt>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Txt variant="h3" style={{ color: t.color.textInverse }}>{away.length}</Txt>
                  <Txt variant="overline" style={{ color: t.dark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)" }}>
                    AWAY
                  </Txt>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Txt variant="h3" style={{ color: t.color.textInverse }}>{offline.length}</Txt>
                  <Txt variant="overline" style={{ color: t.dark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)" }}>
                    OFFLINE
                  </Txt>
                </View>
              </Row>
            </Row>
          </View>
        </Appear>
      ) : null}

      {/* ── Active now ──────────────────────────────────────────────────── */}
      <SectionHeader title="Active now" icon="pulse-outline" />
      {[...online, ...away].length === 0 && officers !== null ? (
        <EmptyState compact icon="moon-outline" title="Nobody is online"
                    body="Officers appear here the moment they open the app." />
      ) : null}

      <View style={{ gap: space.md }}>
        {[...online, ...away].map((o, i) => (
          <Appear key={o.user_id} delay={i * 50}>
            <Card level={1} onPress={() => router.push(`/(admin)/officer/${o.user_id}`)}>
              <Row gap={space.md} align="center">
                <View style={{
                  width: 40, height: 40, borderRadius: radius.md,
                  backgroundColor: t.color.bgSunken,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons
                    name={ACTIVITY_ICON[o.current_activity ?? "browsing"] ?? "compass"}
                    size={18} color={t.color.text}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Row gap={6} align="center">
                    <View style={{
                      width: 7, height: 7, borderRadius: 4,
                      backgroundColor: o.presence === "online" ? t.color.success : t.color.warning,
                    }} />
                    <Txt variant="bodyMd" numberOfLines={1} style={{ flex: 1 }}>
                      {o.full_name}
                    </Txt>
                  </Row>
                  <Txt variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 3 }}>
                    {ACTIVITY_LABEL[o.current_activity ?? "browsing"]}
                    {o.current_entity ? ` · ${o.current_entity}` : ""}
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.color.textSubtle} />
              </Row>
            </Card>
          </Appear>
        ))}
      </View>

      {/* ── Activity stream ─────────────────────────────────────────────── */}
      <SectionHeader title="Activity stream" icon="list-outline" />
      <Card level={1}>
        {DEMO_ACTIVITY_FEED.map((e, i) => (
          <View key={e.id}>
            <Row gap={space.md} align="flex-start" style={{ paddingVertical: space.md }}>
              <View style={{
                width: 6, height: 6, borderRadius: 3, marginTop: 7,
                backgroundColor: i === 0 ? t.color.success : t.color.border,
              }} />
              <View style={{ flex: 1 }}>
                <Txt variant="small">
                  <Txt variant="bodyMd">{e.who}</Txt> {e.what}
                </Txt>
                <Row justify="space-between" style={{ marginTop: 3 }}>
                  <Txt variant="overline" tone="subtle">{e.detail.toUpperCase()}</Txt>
                  <Txt variant="overline" tone="subtle">{e.ago.toUpperCase()}</Txt>
                </Row>
              </View>
            </Row>
            {i < DEMO_ACTIVITY_FEED.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <Card level={1} style={{ marginTop: space.base }}>
        <Row gap={space.sm} align="flex-start">
          <Ionicons name="information-circle-outline" size={15}
                    color={t.color.textMuted} style={{ marginTop: 1 }} />
          <Txt variant="caption" tone="subtle" style={{ flex: 1, lineHeight: 18 }}>
            Presence is derived from a heartbeat, not a socket: two minutes without one is
            "away", ten is "offline". A phone that loses signal mid-session therefore drops
            out on its own rather than sitting here as online and inflating your engagement
            numbers.
          </Txt>
        </Row>
      </Card>
    </Screen>
  );
}
