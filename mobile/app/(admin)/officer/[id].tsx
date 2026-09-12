/**
 * Officer detail.
 *
 * Answers, on one screen, the four questions an administrator actually has
 * about a named officer:
 *   Are they using it?      presence, streak, minutes, last seen
 *   Where are they weak?    ranked gaps against their FRAC role
 *   Why?                    the specific misconceptions they keep repeating
 *   What happens next?      the prescribed step, and whether it is reachable
 */
import React, { useMemo, useState, useCallback } from "react";
import { View, StyleSheet, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTheme, space, radius, elevation } from "../../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, Divider, IconButton,
  LevelBadge, Loading, EmptyState, useOnInverse,
} from "../../../src/components/ui";
import { GapBar } from "../../../src/components/charts";
import { confirmAsync, notify } from "../../../src/lib/dialog";
import { Appear, CountUp, GrowBar, AnimatedRing } from "../../../src/components/motion";
import { useSession } from "../../../src/store/session";
import {
  listOfficers, resetOfficerPassword, setOfficerActive, type OfficerOverview,
} from "../../../src/lib/api";
import { DEMO_COMPETENCIES, DEMO_MISCONCEPTIONS, DEMO_ZPD } from "../../../src/lib/demo";

const ACTIVITY_LABEL: Record<string, string> = {
  reviewing: "Reviewing flashcards", quiz: "Taking a quiz", reading: "Reading material",
  video: "Watching a video", tutor: "With the AI tutor", assessment: "In an assessment",
  browsing: "Browsing", idle: "Idle",
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)} minutes ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)} hours ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export default function OfficerDetail() {
  const t = useTheme();
  const router = useRouter();
  const onInv = useOnInverse();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDemo, loading: sessionLoading } = useSession();

  const [officer, setOfficer] = useState<OfficerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await listOfficers(isDemo);
      setOfficer(all.find((o) => o.user_id === id) ?? all[0] ?? null);
    } finally {
      setLoading(false);
    }
  }, [id, isDemo]);

  React.useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [load, sessionLoading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  // In demo mode the competency detail comes from the seeded profile; live,
  // it would be fetched per officer. Shape is identical either way.
  const gaps = useMemo(
    () => [...DEMO_COMPETENCIES]
      .filter((c) => c.current < c.required)
      .sort((a, b) => (b.required - b.current) - (a.required - a.current))
      .slice(0, 6),
    [],
  );

  if (loading) return <Screen><Loading label="Loading officer…" /></Screen>;
  if (!officer) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title="Officer not found"
                    actionLabel="Back to roster" onAction={() => router.back()} />
      </Screen>
    );
  }

  const o = officer;
  const readiness = o.competencies_mapped > 0 ? o.competencies_met / o.competencies_mapped : 0;
  const initials = (o.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const dot = o.presence === "online" ? t.color.success
            : o.presence === "away"   ? t.color.warning : t.color.border;

  const doReset = async () => {
    const ok = await confirmAsync({
      title: "Reset password?",
      message: `A new temporary password will be generated for ${o.full_name}. Their current password stops working immediately.`,
      confirmLabel: "Reset",
      destructive: true,
    });
    if (!ok) return;
    if (isDemo) {
      notify("Demo mode", "In demo mode no account is changed.");
      return;
    }
    setBusy(true);
    try {
      const res = await resetOfficerPassword(o.user_id);
      await Clipboard.setStringAsync(
        `Email: ${o.email}\nPassword: ${res.temporary_password}`,
      ).catch(() => {});
      notify(
        "Password reset",
        `New temporary password: ${res.temporary_password}\n\nCopied to clipboard. It is shown once.`,
      );
    } catch (e) {
      notify("Reset failed", (e as Error).message);
    } finally { setBusy(false); }
  };

  const toggleActive = async () => {
    const turningOff = o.is_active;
    const ok = await confirmAsync({
      title: turningOff ? "Disable account?" : "Re-enable account?",
      message: turningOff
        ? `${o.full_name} will be unable to sign in. Their competency history is kept — it is a service record.`
        : `${o.full_name} will be able to sign in again.`,
      confirmLabel: turningOff ? "Disable" : "Enable",
      destructive: turningOff,
    });
    if (!ok) return;
    if (isDemo) { notify("Demo mode", "No account is changed in demo mode."); return; }
    setBusy(true);
    try { await setOfficerActive(o.user_id, !o.is_active); await load(); }
    catch (e) { notify("Update failed", (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Screen refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.color.text} />
    }>
      <Row gap={space.md} style={{ marginTop: space.sm, marginBottom: space.base }}>
        <IconButton icon="chevron-back" tone="plain" onPress={() => router.back()} />
        <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>Officer record</Txt>
      </Row>

      {/* ── Identity ────────────────────────────────────────────────────── */}
      <Appear from="scale">
        <View style={{
          borderRadius: radius.xl, padding: space.lg,
          backgroundColor: t.color.bgInverse, ...elevation(3, t.color.shadow),
        }}>
          <Row gap={space.base}>
            <View>
              <View style={{
                width: 58, height: 58, borderRadius: 29,
                backgroundColor: onInv.fill,
                borderWidth: 1.5, borderColor: onInv.hairline,
                alignItems: "center", justifyContent: "center",
              }}>
                <Txt variant="h3" style={{ color: onInv.strong }}>{initials}</Txt>
              </View>
              <View style={{
                position: "absolute", right: -2, bottom: -2,
                width: 16, height: 16, borderRadius: 8, backgroundColor: dot,
                borderWidth: 3, borderColor: t.color.bgInverse,
              }} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="h2" style={{ color: onInv.strong }} numberOfLines={1}>
                {o.full_name}
              </Txt>
              <Txt variant="small" style={{ color: onInv.muted }} numberOfLines={1}>
                {o.designation ?? o.role_name}
              </Txt>
              <Txt variant="overline" style={{ color: onInv.subtle, marginTop: 4 }}>
                {o.employee_code} · {o.role_code}
              </Txt>
            </View>
          </Row>

          <Divider style={{ marginVertical: space.base, backgroundColor: onInv.hairline }} />

          <Row justify="space-between">
            <View>
              <Txt variant="overline" style={{ color: onInv.subtle }}>STATUS</Txt>
              <Row gap={5} style={{ marginTop: 3 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
                <Txt variant="bodyMd" style={{ color: onInv.strong }}>
                  {o.presence === "online" ? "Online" : o.presence === "away" ? "Away" : "Offline"}
                </Txt>
              </Row>
            </View>
            <View>
              <Txt variant="overline" style={{ color: onInv.subtle }}>LAST SEEN</Txt>
              <Txt variant="bodyMd" style={{ color: onInv.strong, marginTop: 3 }}>
                {relative(o.last_seen_at ?? o.last_login_at)}
              </Txt>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Txt variant="overline" style={{ color: onInv.subtle }}>STREAK</Txt>
              <Txt variant="bodyMd" style={{ color: onInv.strong, marginTop: 3 }}>
                {o.streak_current} days
              </Txt>
            </View>
          </Row>

          {o.presence !== "offline" && o.current_activity ? (
            <View style={{
              marginTop: space.base, padding: space.md,
              borderRadius: radius.md, backgroundColor: onInv.fill,
            }}>
              <Txt variant="overline" style={{ color: onInv.subtle }}>RIGHT NOW</Txt>
              <Txt variant="bodyMd" style={{ color: onInv.strong, marginTop: 3 }}>
                {ACTIVITY_LABEL[o.current_activity] ?? o.current_activity}
              </Txt>
              {o.current_entity ? (
                <Txt variant="caption" style={{ color: onInv.muted, marginTop: 2 }}>
                  {o.current_entity}
                </Txt>
              ) : null}
            </View>
          ) : null}
        </View>
      </Appear>

      {/* ── Engagement ──────────────────────────────────────────────────── */}
      <Appear delay={100}>
        <Row gap={space.md} style={{ marginTop: space.base }}>
          <Card level={1} style={{ flex: 1, alignItems: "center", paddingVertical: space.base }}>
            <CountUp value={o.minutes_last_7d} variant="h2" delay={150} />
            <Txt variant="overline" tone="subtle">MIN / 7 DAYS</Txt>
          </Card>
          <Card level={1} style={{ flex: 1, alignItems: "center", paddingVertical: space.base }}>
            <CountUp value={o.quizzes_completed} variant="h2" delay={230} />
            <Txt variant="overline" tone="subtle">QUIZZES</Txt>
          </Card>
          <Card level={1} style={{ flex: 1, alignItems: "center", paddingVertical: space.base }}>
            <CountUp value={o.cards_due} variant="h2" delay={310} />
            <Txt variant="overline" tone="subtle">CARDS DUE</Txt>
          </Card>
        </Row>
      </Appear>

      {/* ── Role readiness ──────────────────────────────────────────────── */}
      <Appear delay={170}>
        <Card level={2} style={{ marginTop: space.base }}>
          <Row gap={space.lg}>
            <AnimatedRing value={readiness} size={92} stroke={9} delay={300}
                          color={readiness > 0.7 ? t.color.success : t.color.text}>
              <CountUp value={Math.round(readiness * 100)} suffix="%" variant="h3" delay={300} />
            </AnimatedRing>
            <View style={{ flex: 1, gap: space.sm }}>
              <View>
                <Txt variant="bodyMd">Role readiness</Txt>
                <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {o.competencies_met} of {o.competencies_mapped} competencies at the bar for{" "}
                  {o.role_name}
                </Txt>
              </View>
              <Divider />
              <Row justify="space-between">
                <Txt variant="small" tone="muted">Critical gaps</Txt>
                <Badge label={String(o.critical_gaps)}
                       tone={o.critical_gaps > 0 ? "danger" : "success"} size="sm" />
              </Row>
              <Row justify="space-between">
                <Txt variant="small" tone="muted">Measurement confidence</Txt>
                <Txt variant="small"
                     tone={(o.avg_confidence ?? 0) > 0.6 ? "success" : "warning"}>
                  {Math.round((o.avg_confidence ?? 0) * 100)}%
                </Txt>
              </Row>
            </View>
          </Row>
        </Card>
      </Appear>

      {/* ── Where they are lacking ──────────────────────────────────────── */}
      <Appear delay={230}>
        <Row justify="space-between" style={{ marginTop: space.xl, marginBottom: space.md }}>
          <Row gap={space.sm}>
            <Ionicons name="trending-down" size={17} color={t.color.textMuted} />
            <Txt variant="h3">Where they are lacking</Txt>
          </Row>
        </Row>
        <Card level={1}>
          <View style={{ gap: space.base }}>
            {gaps.map((c) => (
              <View key={c.code}>
                <Row justify="space-between" align="flex-start" style={{ marginBottom: 6 }}>
                  <View style={{ flex: 1, marginRight: space.sm }}>
                    <Txt variant="bodyMd" numberOfLines={1}>{c.name}</Txt>
                    <Txt variant="overline" tone="subtle" style={{ marginTop: 2 }}>
                      {c.code} · {c.comp_type.replace("_", " ").toUpperCase()}
                    </Txt>
                  </View>
                  {c.is_critical ? <Badge label="CRITICAL" tone="danger" size="sm" /> : null}
                </Row>
                <GapBar current={c.current} required={c.required} />
                <Row justify="space-between" style={{ marginTop: 6 }}>
                  <LevelBadge level={c.current} size="sm" />
                  <Txt variant="caption" tone="subtle">
                    {c.evidence} items · {Math.round(c.confidence * 100)}% confidence
                  </Txt>
                </Row>
              </View>
            ))}
          </View>
        </Card>
      </Appear>

      {/* ── Why — the repeated misconceptions ───────────────────────────── */}
      <Appear delay={290}>
        <Row gap={space.sm} style={{ marginTop: space.xl, marginBottom: space.md }}>
          <Ionicons name="git-compare-outline" size={17} color={t.color.textMuted} />
          <Txt variant="h3">Why they are getting it wrong</Txt>
        </Row>
        <Card level={1}>
          <Txt variant="small" tone="muted" style={{ marginBottom: space.base, lineHeight: 20 }}>
            Derived from which distractor they chose, not from the score. These are the
            false models this officer has demonstrated more than once.
          </Txt>
          <View style={{ gap: space.md }}>
            {DEMO_MISCONCEPTIONS.map((m, i) => (
              <View key={i} style={{
                padding: space.md, borderRadius: radius.md,
                backgroundColor: t.color.bgSunken,
                borderLeftWidth: 3,
                borderLeftColor: m.occurrences >= 4 ? t.color.text : t.color.borderStrong,
              }}>
                <Row justify="space-between" style={{ marginBottom: 5 }}>
                  <Txt variant="overline" tone="muted">{m.competency_code}</Txt>
                  <Txt variant="overline" tone="subtle">{m.occurrences}× · {m.last_seen.toUpperCase()}</Txt>
                </Row>
                <Txt variant="small" style={{ lineHeight: 20 }}>{m.misconception}</Txt>
              </View>
            ))}
          </View>
        </Card>
      </Appear>

      {/* ── What happens next ───────────────────────────────────────────── */}
      <Appear delay={350}>
        <Row gap={space.sm} style={{ marginTop: space.xl, marginBottom: space.md }}>
          <Ionicons name="navigate-outline" size={17} color={t.color.textMuted} />
          <Txt variant="h3">Next steps</Txt>
        </Row>

        {o.next_step ? (
          <Card level={2} tone="primary">
            <Txt variant="overline" tone="muted">PRESCRIBED NEXT</Txt>
            <Txt variant="bodyMd" style={{ marginTop: 4 }}>{o.next_step}</Txt>
          </Card>
        ) : (
          <Card level={1}>
            <Txt variant="small" tone="muted">
              No active learning path. Generate one once they have taken a diagnostic.
            </Txt>
          </Card>
        )}

        <Card level={1} style={{ marginTop: space.md }}>
          <Txt variant="overline" tone="subtle" style={{ marginBottom: space.sm }}>
            LEARNABLE NOW — PREREQUISITES ALREADY MET
          </Txt>
          <View style={{ gap: space.sm }}>
            {DEMO_ZPD.slice(0, 4).map((z) => {
              const ready = z.readiness >= 0.99;
              return (
                <Row key={z.code} justify="space-between" align="flex-start" style={{
                  paddingVertical: space.sm,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: t.color.border,
                }}>
                  <View style={{ flex: 1, marginRight: space.sm }}>
                    <Txt variant="small" numberOfLines={1}>{z.name}</Txt>
                    {!ready ? (
                      <Txt variant="overline" tone="subtle" style={{ marginTop: 2 }}>
                        BLOCKED BY {z.blocked_by.join(", ").toUpperCase()}
                      </Txt>
                    ) : null}
                  </View>
                  <Badge label={ready ? "READY" : `${Math.round(z.readiness * 100)}%`}
                         tone={ready ? "success" : "neutral"} size="sm" />
                </Row>
              );
            })}
          </View>
        </Card>
      </Appear>

      {/* ── Account actions ─────────────────────────────────────────────── */}
      <Appear delay={410}>
        <Row gap={space.sm} style={{ marginTop: space.xl, marginBottom: space.md }}>
          <Ionicons name="key-outline" size={17} color={t.color.textMuted} />
          <Txt variant="h3">Account</Txt>
        </Row>
        <Card level={1}>
          <Row justify="space-between" style={{ marginBottom: space.md }}>
            <Txt variant="small" tone="muted">Email</Txt>
            <Txt variant="small" selectable>{o.email}</Txt>
          </Row>
          <Divider />
          <Row justify="space-between" style={{ marginVertical: space.md }}>
            <Txt variant="small" tone="muted">Account status</Txt>
            <Badge label={o.is_active ? "ACTIVE" : "DISABLED"}
                   tone={o.is_active ? "success" : "neutral"} size="sm" />
          </Row>
          <Divider />
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Button label="Reset password" variant="secondary" size="sm" icon="refresh"
                    loading={busy} onPress={doReset} style={{ flex: 1 }} />
            <Button label={o.is_active ? "Disable" : "Enable"}
                    variant={o.is_active ? "danger" : "success"} size="sm"
                    icon={o.is_active ? "lock-closed" : "lock-open"}
                    loading={busy} onPress={toggleActive} style={{ flex: 1 }} />
          </Row>
        </Card>
      </Appear>
    </Screen>
  );
}
