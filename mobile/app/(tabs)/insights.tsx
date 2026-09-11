import React, { useMemo, useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Badge, Button, SectionHeader, Chip,
  LevelBadge, Divider, ProgressBar,
} from "../../src/components/ui";
import { CompetencyRadar, StreakHeatmap, GapBar, ProgressRing } from "../../src/components/charts";
import { DEMO_COMPETENCIES, DEMO_DIAGNOSIS, demoHeatmap } from "../../src/lib/demo";

type Filter = "all" | "functional" | "behavioural" | "domain";

export default function Insights() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>("all");
  const [showDiagnosis, setShowDiagnosis] = useState(true);

  const heat = useMemo(() => demoHeatmap(), []);

  const filtered = useMemo(
    () => filter === "all" ? DEMO_COMPETENCIES : DEMO_COMPETENCIES.filter((c) => c.comp_type === filter),
    [filter],
  );

  const radarAxes = useMemo(
    () => DEMO_COMPETENCIES.slice(0, 8).map((c) => ({
      label: c.name, short: c.short, current: c.current, required: c.required,
    })),
    [],
  );

  const met = DEMO_COMPETENCIES.filter((c) => c.current >= c.required).length;
  const critical = DEMO_COMPETENCIES.filter((c) => c.is_critical && c.current < c.required).length;
  const avgConfidence = DEMO_COMPETENCIES.reduce((s, c) => s + c.confidence, 0) / DEMO_COMPETENCIES.length;
  const readiness = met / DEMO_COMPETENCIES.length;

  const radarSize = Math.min(width - space.base * 2 - space.base * 2, 300);

  return (
    <Screen>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <Txt variant="overline" tone="primary">FRAC COMPETENCY PROFILE</Txt>
        <Txt variant="h1" style={{ marginTop: 4 }}>Your insights</Txt>
        <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
          Measured against Junior Statistical Officer requirements
        </Txt>
      </View>

      {/* ── Role readiness ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(360)}>
        <Card level={2}>
          <Row gap={space.lg}>
            <ProgressRing
              value={readiness}
              size={104}
              stroke={9}
              label={`${Math.round(readiness * 100)}%`}
              sublabel="READY"
              tone={readiness > 0.7 ? t.color.success : t.color.primary}
            />
            <View style={{ flex: 1, gap: space.sm }}>
              <View>
                <Txt variant="h3">Role readiness</Txt>
                <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {met} of {DEMO_COMPETENCIES.length} competencies at or above requirement
                </Txt>
              </View>
              <Divider />
              <Row justify="space-between">
                <Txt variant="small" tone="muted">Critical gaps</Txt>
                <Badge label={String(critical)} tone={critical > 0 ? "danger" : "success"} size="sm" />
              </Row>
              <Row justify="space-between">
                <Txt variant="small" tone="muted">Measurement confidence</Txt>
                <Txt variant="small" tone={avgConfidence > 0.7 ? "success" : "warning"}>
                  {Math.round(avgConfidence * 100)}%
                </Txt>
              </Row>
            </View>
          </Row>
        </Card>
      </Animated.View>

      {/* ── Radar ──────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(80).duration(360)}>
        <SectionHeader title="Competency radar" icon="radio-outline" />
        <Card level={1} style={{ alignItems: "center", paddingVertical: space.lg }}>
          <CompetencyRadar axes={radarAxes} size={radarSize} />
        </Card>
      </Animated.View>

      {/* ── AI diagnosis ───────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(140).duration(360)}>
        <SectionHeader title="AI diagnosis" icon="sparkles-outline" />
        <Card level={2} tone="primary">
          <Pressable onPress={() => setShowDiagnosis((s) => !s)}>
            <Row justify="space-between">
              <Row gap={space.sm} style={{ flex: 1 }}>
                <View style={{
                  width: 30, height: 30, borderRadius: 15,
                  backgroundColor: t.color.primary,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name="sparkles" size={15} color={t.color.onPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyMd">Competency assessment</Txt>
                  <Txt variant="overline" tone="subtle">KIMI K2.6 · DETERMINISTIC GAP MATHS</Txt>
                </View>
              </Row>
              <Ionicons name={showDiagnosis ? "chevron-up" : "chevron-down"} size={16} color={t.color.primary} />
            </Row>
          </Pressable>

          {showDiagnosis ? (
            <Animated.View entering={FadeIn.duration(240)}>
              <Txt variant="body" tone="muted" style={{ marginTop: space.md, lineHeight: 23 }}>
                {DEMO_DIAGNOSIS.overall_summary}
              </Txt>

              <Divider style={{ marginVertical: space.base }} />

              <Txt variant="overline" tone="success" style={{ marginBottom: space.sm }}>STRENGTHS</Txt>
              {DEMO_DIAGNOSIS.strengths.map((s) => (
                <Row key={s.competency_code} gap={space.sm} align="flex-start" style={{ marginBottom: space.sm }}>
                  <Ionicons name="checkmark-circle" size={15} color={t.color.success} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" tone="primary">{s.competency_code}</Txt>
                    <Txt variant="small" tone="muted" style={{ marginTop: 2, lineHeight: 20 }}>{s.note}</Txt>
                  </View>
                </Row>
              ))}

              <Divider style={{ marginVertical: space.base }} />

              <Txt variant="overline" tone="danger" style={{ marginBottom: space.sm }}>PRIORITY GAPS</Txt>
              {DEMO_DIAGNOSIS.priority_gaps.map((g, i) => (
                <View key={g.competency_code} style={{
                  marginBottom: space.md, padding: space.md,
                  borderRadius: radius.md, backgroundColor: t.color.bgElevated,
                }}>
                  <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: t.color.danger,
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Txt variant="overline" style={{ color: "#FFFFFF" }}>{i + 1}</Txt>
                    </View>
                    <Txt variant="caption" tone="primary">{g.competency_code}</Txt>
                  </Row>
                  <Txt variant="small" tone="muted" style={{ lineHeight: 20 }}>{g.rationale}</Txt>

                  <View style={{
                    marginTop: space.sm, padding: space.sm,
                    borderRadius: radius.sm, backgroundColor: t.color.dangerSoft,
                  }}>
                    <Txt variant="overline" tone="danger">IF UNADDRESSED</Txt>
                    <Txt variant="caption" tone="muted" style={{ marginTop: 3, lineHeight: 18 }}>
                      {g.impact_on_role}
                    </Txt>
                  </View>

                  <Row gap={6} align="flex-start" style={{ marginTop: space.sm }}>
                    <Ionicons name="arrow-forward-circle" size={14} color={t.color.primary} style={{ marginTop: 1 }} />
                    <Txt variant="caption" tone="primary" style={{ flex: 1, lineHeight: 18 }}>
                      {g.suggested_first_step}
                    </Txt>
                  </Row>
                </View>
              ))}

              <Button
                label="Generate plan from this"
                icon="map"
                full
                onPress={() => router.push("/(tabs)/path")}
                style={{ marginTop: space.sm }}
              />
            </Animated.View>
          ) : null}
        </Card>
      </Animated.View>

      {/* ── All competencies ───────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(200).duration(360)}>
        <SectionHeader title="All competencies" icon="grid-outline" />
        <Row gap={space.sm} wrap style={{ marginBottom: space.md }}>
          {(["all", "functional", "behavioural", "domain"] as Filter[]).map((f) => (
            <Chip key={f} label={f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
                  selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </Row>

        <View style={{ gap: space.md }}>
          {filtered.map((c) => {
            const met = c.current >= c.required;
            const lowConfidence = c.confidence < 0.5;
            return (
              <Card key={c.code} level={1} onPress={() => router.push(`/competency/${c.code}`)}>
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1, marginRight: space.sm }}>
                    <Txt variant="bodyMd" numberOfLines={2}>{c.name}</Txt>
                    <Txt variant="overline" tone="subtle" style={{ marginTop: 3 }}>
                      {c.code} · {c.comp_type.toUpperCase()}
                    </Txt>
                  </View>
                  {met
                    ? <Ionicons name="checkmark-circle" size={20} color={t.color.success} />
                    : c.is_critical
                      ? <Badge label="CRITICAL" tone="danger" size="sm" />
                      : null}
                </Row>

                <View style={{ marginTop: space.md }}>
                  <GapBar current={c.current} required={c.required} />
                  <Row justify="space-between" style={{ marginTop: 7 }}>
                    <LevelBadge level={c.current} size="sm" />
                    <Row gap={space.sm}>
                      {lowConfidence ? (
                        <Badge label="LOW DATA" tone="warning" size="sm" icon="help-circle" />
                      ) : null}
                      <Txt variant="caption" tone="subtle">{c.evidence} items</Txt>
                    </Row>
                  </Row>
                </View>
              </Card>
            );
          })}
        </View>
      </Animated.View>

      {/* ── Consistency ────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(260).duration(360)}>
        <SectionHeader title="Study consistency" icon="calendar-outline" />
        <Card level={1}>
          <Txt variant="small" tone="muted" style={{ marginBottom: space.md }}>
            Minutes studied over the last 12 weeks. Consistency beats intensity —
            spaced review is what moves competency, not marathon sessions.
          </Txt>
          <StreakHeatmap data={heat} weeks={12} />
        </Card>
      </Animated.View>
    </Screen>
  );
}
