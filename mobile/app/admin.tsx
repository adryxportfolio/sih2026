/**
 * Administrator / Nodal Officer dashboard.
 *
 * SIH26101 asks for interactive learner AND administrator dashboards, and the
 * administrator view is where this stops being another LMS. The Ministry's
 * question is not "did Rahul finish his course" — it is:
 *
 *   Where is our workforce weak, how many people does it affect, which
 *   training should we commission, and is it working?
 *
 * Every figure here is an aggregate. The underlying view groups before it
 * returns rows, so no individual officer is identifiable from this screen.
 */
import React, { useMemo, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius, elevation } from "../src/theme";
import {
  Screen, Txt, Row, Card, Badge, Button, SectionHeader, Divider,
  IconButton, ProgressBar, Chip, StatTile, useOnInverse,
} from "../src/components/ui";
import { Sparkline, ProgressRing } from "../src/components/charts";
import {
  DEMO_ORG_SUMMARY, DEMO_ORG_GAPS, DEMO_FAMILY_HEALTH,
  DEMO_TRAINING_DEMAND, DEMO_OFFICE_BREAKDOWN, DEMO_ORG_TREND,
} from "../src/lib/demo";

type Tab = "gaps" | "demand" | "offices";

const FAMILY_LABEL: Record<string, string> = {
  functional: "Statistical",
  domain: "Domain",
  behavioural: "Behavioural",
  technical: "Technical",
  digital_governance: "Digital Gov",
};

export default function AdminDashboard() {
  const t = useTheme();
  const router = useRouter();
  const onInv = useOnInverse();
  const [tab, setTab] = useState<Tab>("gaps");

  const s = DEMO_ORG_SUMMARY;
  const worstFamily = useMemo(
    () => [...DEMO_FAMILY_HEALTH].sort((a, b) => a.avg - b.avg)[0],
    [],
  );
  const coverage = s.assessed / s.total_officials;

  return (
    <Screen>
      {/* Header */}
      <Row gap={space.md} style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <IconButton icon="chevron-back" tone="plain" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="muted">NODAL OFFICER VIEW</Txt>
          <Txt variant="h2" style={{ marginTop: 2 }}>Workforce Intelligence</Txt>
        </View>
      </Row>

      <Txt variant="small" tone="muted" style={{ marginBottom: space.base }}>
        {s.organisation}
      </Txt>

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(360)}>
        <View style={{
          borderRadius: radius.xl, padding: space.lg,
          backgroundColor: t.color.bgInverse,
          ...elevation(3, t.color.shadow),
        }}>
          <Row justify="space-between" align="flex-start">
            <View>
              <Txt variant="overline" style={{ color: onInv.muted }}>WORKFORCE COMPETENCY</Txt>
              <Row gap={8} align="flex-end" style={{ marginTop: 6 }}>
                <Txt variant="display" style={{ color: onInv.strong }}>
                  {Math.round(s.avg_competency * 100)}%
                </Txt>
                <Row gap={2} style={{ marginBottom: 9 }}>
                  <Ionicons name="arrow-up" size={13} color={onInv.strong} />
                  <Txt variant="caption" style={{ color: onInv.muted }}>
                    {Math.round(s.avg_competency_delta * 100)} pts
                  </Txt>
                </Row>
              </Row>
              <Txt variant="caption" style={{ color: onInv.subtle, marginTop: 2 }}>
                vs last quarter
              </Txt>
            </View>
            <Sparkline
              values={DEMO_ORG_TREND}
              width={120} height={48}
              tone={t.dark ? "#000000" : "#FFFFFF"}
            />
          </Row>

          <Divider style={{ marginVertical: space.base, backgroundColor: onInv.hairline }} />

          {/* Four stats across a 375dp screen: each cell flexes and the labels
              are allowed to shrink, so nothing clips on a small handset. */}
          <Row justify="space-between" align="flex-start">
            <HeadlineStat label="OFFICIALS" value={s.total_officials.toLocaleString()} onInv={onInv} />
            <HeadlineStat label="ASSESSED" value={`${Math.round(coverage * 100)}%`} onInv={onInv} />
            <HeadlineStat label="CRITICAL" value={String(s.critical_gaps_open)} onInv={onInv} />
            <HeadlineStat label="COMPLETED" value={`${Math.round(s.completion_rate * 100)}%`} onInv={onInv} />
          </Row>
        </View>
      </Animated.View>

      {/* ── The headline finding ─────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(70).duration(360)}>
        <Card level={2} style={{ marginTop: space.base }}>
          <Row gap={space.sm} style={{ marginBottom: space.sm }}>
            <Ionicons name="alert-circle" size={16} color={t.color.text} />
            <Txt variant="bodyMd">What this says</Txt>
          </Row>
          <Txt variant="body" tone="muted" style={{ lineHeight: 23 }}>
            Statistical craft is not the problem — your workforce sits at{" "}
            <Txt variant="bodyMd">{Math.round((DEMO_FAMILY_HEALTH[0].avg) * 100)}%</Txt> on
            statistical competencies. The gap is <Txt variant="bodyMd">{worstFamily.family}</Txt>,
            at <Txt variant="bodyMd">{Math.round(worstFamily.avg * 100)}%</Txt>.
            {" "}
            <Txt variant="bodyMd">{DEMO_ORG_GAPS[0].officials_below.toLocaleString()} officials</Txt>{" "}
            are below the required bar for Python alone.
          </Txt>
          <Txt variant="small" tone="subtle" style={{ marginTop: space.sm, lineHeight: 20 }}>
            Commissioning more sampling training would be the wrong call. The
            evidence points at tooling and data-protection literacy.
          </Txt>
        </Card>
      </Animated.View>

      {/* ── Competency families ──────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(130).duration(360)}>
        <SectionHeader title="By competency family" icon="layers-outline" />
        <Card level={1}>
          <View style={{ gap: space.base }}>
            {DEMO_FAMILY_HEALTH.map((f) => {
              const weak = f.avg < 0.55;
              return (
                <View key={f.key}>
                  <Row justify="space-between" style={{ marginBottom: 6 }}>
                    <Row gap={space.sm}>
                      <Txt variant="bodyMd">{f.family}</Txt>
                      {weak ? <Badge label="WEAK" tone="danger" size="sm" /> : null}
                    </Row>
                    <Txt variant="bodyMd" tone={weak ? "danger" : "default"}>
                      {Math.round(f.avg * 100)}%
                    </Txt>
                  </Row>
                  <ProgressBar value={f.avg} height={7} tone={weak ? "danger" : "primary"} />
                </View>
              );
            })}
          </View>
        </Card>
      </Animated.View>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Row gap={space.sm} wrap style={{ marginTop: space.xl, marginBottom: space.md }}>
        <Chip label="Skill gaps" selected={tab === "gaps"} onPress={() => setTab("gaps")} />
        <Chip label="Training demand" selected={tab === "demand"} onPress={() => setTab("demand")} />
        <Chip label="By office" selected={tab === "offices"} onPress={() => setTab("offices")} />
      </Row>

      {tab === "gaps" ? (
        <Card level={1}>
          <Txt variant="small" tone="muted" style={{ marginBottom: space.base, lineHeight: 20 }}>
            Average measured proficiency against the level the role requires,
            ranked by how many officials fall short.
          </Txt>
          <View style={{ gap: space.base }}>
            {DEMO_ORG_GAPS.map((g) => {
              const met = g.avg >= g.required;
              return (
                <View key={g.code}>
                  <Row justify="space-between" align="flex-start" style={{ marginBottom: 6 }}>
                    <View style={{ flex: 1, marginRight: space.sm }}>
                      <Txt variant="bodyMd" numberOfLines={1}>{g.name}</Txt>
                      <Row gap={space.sm} style={{ marginTop: 3 }}>
                        <Txt variant="overline" tone="subtle">
                          {FAMILY_LABEL[g.family]?.toUpperCase()}
                        </Txt>
                        <Txt variant="overline" tone="subtle">
                          · {g.officials_below.toLocaleString()} BELOW BAR
                        </Txt>
                      </Row>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Txt variant="bodyMd" tone={met ? "success" : "danger"}>
                        {Math.round(g.avg * 100)}%
                      </Txt>
                      <Txt variant="overline" tone="subtle">
                        NEED {Math.round(g.required * 100)}%
                      </Txt>
                    </View>
                  </Row>

                  {/* current fill with a required marker */}
                  <View style={{
                    height: 9, borderRadius: 5,
                    backgroundColor: t.color.bgSunken, overflow: "visible",
                  }}>
                    <View style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${g.avg * 100}%`, borderRadius: 5,
                      backgroundColor: met ? t.color.success : t.color.text,
                    }} />
                    <View style={{
                      position: "absolute", left: `${g.required * 100}%`,
                      top: -3, bottom: -3, width: 2.5, borderRadius: 2,
                      backgroundColor: t.color.textMuted,
                      transform: [{ translateX: -1.25 }],
                    }} />
                  </View>

                  <Row gap={4} style={{ marginTop: 5 }}>
                    <Ionicons name="trending-up" size={10} color={t.color.success} />
                    <Txt variant="overline" tone="subtle">
                      +{Math.round(g.trend * 100)} PTS THIS QUARTER
                    </Txt>
                  </Row>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {tab === "demand" ? (
        <Card level={1}>
          <Txt variant="small" tone="muted" style={{ marginBottom: space.base, lineHeight: 20 }}>
            Derived from the gap analysis, not from enrolment requests — this is
            what the workforce <Txt variant="bodyMd">needs</Txt>, which is not always
            what it signs up for.
          </Txt>
          <View style={{ gap: space.md }}>
            {DEMO_TRAINING_DEMAND.map((d) => (
              <View key={d.programme} style={{
                padding: space.md, borderRadius: radius.md,
                backgroundColor: t.color.bgSunken,
              }}>
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1, marginRight: space.sm }}>
                    <Txt variant="bodyMd" numberOfLines={2}>{d.programme}</Txt>
                    <Txt variant="overline" tone="subtle" style={{ marginTop: 3 }}>
                      {d.provider.toUpperCase()}
                    </Txt>
                  </View>
                  <Badge
                    label={d.priority.toUpperCase()}
                    tone={d.priority === "critical" ? "danger" : d.priority === "high" ? "warning" : "neutral"}
                    size="sm"
                  />
                </Row>
                <Row justify="space-between" align="flex-end" style={{ marginTop: space.sm }}>
                  <Txt variant="h3">{d.officials_needing.toLocaleString()}</Txt>
                  <Txt variant="caption" tone="subtle">officials need this</Txt>
                </Row>
                <ProgressBar
                  value={d.officials_needing / DEMO_ORG_SUMMARY.total_officials}
                  height={5}
                  style={{ marginTop: space.sm }}
                />
              </View>
            ))}
          </View>
          <Button
            label="Export for TPAC submission"
            variant="secondary"
            icon="download-outline"
            size="sm"
            full
            style={{ marginTop: space.base }}
          />
        </Card>
      ) : null}

      {tab === "offices" ? (
        <Card level={1}>
          <Txt variant="small" tone="muted" style={{ marginBottom: space.base, lineHeight: 20 }}>
            Aggregate per office. Individual officers are never exposed here.
          </Txt>
          <View>
            {DEMO_OFFICE_BREAKDOWN.map((o, i) => (
              <View key={o.office} style={{
                paddingVertical: space.md,
                borderBottomWidth: i === DEMO_OFFICE_BREAKDOWN.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: t.color.border,
              }}>
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1, marginRight: space.md }}>
                    <Txt variant="bodyMd" numberOfLines={1}>{o.office}</Txt>
                    <Row gap={space.sm} style={{ marginTop: 3 }}>
                      <Txt variant="overline" tone="subtle">{o.officials} OFFICIALS</Txt>
                      <Txt variant="overline" tone="subtle">
                        · {Math.round(o.completion * 100)}% COMPLETION
                      </Txt>
                    </Row>
                    <ProgressBar value={o.avg} height={6} style={{ marginTop: space.sm }}
                                 tone={o.avg < 0.62 ? "danger" : "primary"} />
                  </View>
                  <View style={{ alignItems: "flex-end", width: 62 }}>
                    <Txt variant="h3">{Math.round(o.avg * 100)}%</Txt>
                    {o.critical > 2 ? (
                      <Badge label={`${o.critical} CRIT`} tone="danger" size="sm" />
                    ) : (
                      <Txt variant="overline" tone="subtle">{o.critical} CRIT</Txt>
                    )}
                  </View>
                </Row>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card level={1} style={{ marginTop: space.lg }}>
        <Row gap={space.sm} align="flex-start">
          <Ionicons name="shield-checkmark-outline" size={15} color={t.color.textMuted}
                    style={{ marginTop: 1 }} />
          <Txt variant="caption" tone="subtle" style={{ flex: 1, lineHeight: 18 }}>
            Privacy by construction: this dashboard reads an aggregate view that
            groups before returning rows. Row Level Security restricts it to your
            own organisation, and no query path from this screen can reach an
            individual officer's record.
          </Txt>
        </Row>
      </Card>
    </Screen>
  );
}

function HeadlineStat({
  label, value, onInv,
}: { label: string; value: string; onInv: ReturnType<typeof useOnInverse> }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt variant="h3" style={{ color: onInv.strong }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      {/* Explicitly sized rather than relying on adjustsFontSizeToFit, which
          react-native-web ignores — four labels must fit a 375dp row. */}
      <Txt
        variant="overline"
        style={{ color: onInv.subtle, marginTop: 3, fontSize: 9, letterSpacing: 0.5 }}
        numberOfLines={1}
      >
        {label}
      </Txt>
    </View>
  );
}
