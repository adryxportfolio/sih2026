/**
 * Onboarding: profile → prior → diagnostic.
 *
 * SIH26101 says the system should build a competency profile from designation,
 * department, role, experience, education and prior training. The naive
 * reading is "ask them, store it". That produces a profile made entirely of
 * self-report, which is exactly the data you cannot trust — people
 * systematically misjudge their own skill.
 *
 * So we treat the profile as a PRIOR, not an answer:
 *
 *   role + experience + self-rating  →  starting estimate (low confidence)
 *              ↓
 *      diagnostic assessment         →  measured evidence (raises confidence)
 *              ↓
 *        competency profile
 *
 * The learner is told this explicitly. "We've estimated a starting point —
 * the diagnostic will confirm or correct it" sets the right expectation and
 * makes the later correction feel like the system working rather than the
 * system contradicting them.
 */
import React, { useState, useMemo } from "react";
import { View, Pressable, TextInput, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInRight, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius, type as typo, elevation } from "../src/theme";
import {
  Txt, Row, Card, Button, Badge, ProgressBar, Divider, IconButton, useOnInverse,
} from "../src/components/ui";
import { useSession } from "../src/store/session";

const ROLES = [
  { code: "FI",  name: "Field Investigator",           grade: "Group C" },
  { code: "JSO", name: "Junior Statistical Officer",   grade: "Group B" },
  { code: "SSO", name: "Senior Statistical Officer",   grade: "Group B" },
  { code: "ASD", name: "Assistant Director (Stats)",   grade: "Group A" },
  { code: "DD",  name: "Deputy Director (NSO)",        grade: "Group A" },
  { code: "DIR", name: "Director (Statistics)",        grade: "Group A" },
];

const ORGS = [
  "Ministry of Statistics and Programme Implementation",
  "National Statistical Office",
  "Directorate of Economics & Statistics — Maharashtra",
  "Directorate of Economics & Statistics — Tamil Nadu",
  "Directorate of Economics & Statistics — West Bengal",
  "Other State / UT Directorate",
];

/** Self-rated starting points across the four competency families. */
const SELF_RATE = [
  { code: "FUN-SAMP-01", label: "Sampling & estimation",       family: "Statistical" },
  { code: "FUN-CLEAN-01", label: "Data cleaning & imputation", family: "Statistical" },
  { code: "TEC-PY-01",   label: "Python",                       family: "Technical" },
  { code: "TEC-SQL-01",  label: "SQL",                          family: "Technical" },
  { code: "TEC-GIS-01",  label: "GIS / geospatial",             family: "Technical" },
  { code: "DIG-PRIV-01", label: "Data privacy & DPDP Act",      family: "Digital Governance" },
  { code: "DIG-CYBER-01",label: "Cybersecurity",                family: "Digital Governance" },
  { code: "BEH-COM-01",  label: "Communicating findings",       family: "Behavioural" },
];

const LEVELS = ["None", "Beginner", "Practitioner", "Proficient", "Expert"];

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const onInv = useOnInverse();
  const { updateProfile, profile } = useSession();

  const [step, setStep] = useState(0);
  const [designation, setDesignation] = useState(profile?.designation ?? "");
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [org, setOrg] = useState<string | null>(null);
  const [years, setYears] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [goalMinutes, setGoalMinutes] = useState(25);

  const TOTAL = 4;
  const role = ROLES.find((r) => r.code === roleCode);

  const canAdvance = useMemo(() => {
    if (step === 0) return !!roleCode;
    if (step === 1) return !!org && years.trim() !== "";
    if (step === 2) return Object.keys(ratings).length >= 4;
    return true;
  }, [step, roleCode, org, years, ratings]);

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < TOTAL - 1) { setStep((s) => s + 1); return; }
    finish();
  };

  const finish = async () => {
    await updateProfile({
      designation: designation || role?.name || null,
      years_of_service: Number(years) || 0,
      daily_goal_minutes: goalMinutes,
      onboarded_at: new Date().toISOString(),
    } as any);
    router.replace("/(tabs)");
  };

  // A prior from role + experience + self-report. Confidence is deliberately
  // low — this is a starting point, not a measurement.
  const priorConfidence = useMemo(() => {
    const rated = Object.keys(ratings).length;
    return Math.min(0.35, 0.08 + rated * 0.03);
  }, [ratings]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      {/* Progress */}
      <View style={{ paddingHorizontal: space.base, paddingTop: space.sm }}>
        <Row justify="space-between" style={{ marginBottom: space.md }}>
          {step > 0 ? (
            <IconButton icon="chevron-back" tone="plain" onPress={() => setStep((s) => s - 1)} />
          ) : <View style={{ width: 40 }} />}
          <View style={{ flex: 1, marginHorizontal: space.md }}>
            <ProgressBar value={(step + 1) / TOTAL} height={5} />
          </View>
          <Txt variant="caption" tone="subtle">{step + 1}/{TOTAL}</Txt>
        </Row>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.base, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── STEP 0 · Role ─────────────────────────────────────────────── */}
        {step === 0 ? (
          <Animated.View entering={FadeInRight.duration(300)}>
            <Txt variant="overline" tone="muted">STEP 1 OF 4</Txt>
            <Txt variant="h1" style={{ marginTop: 6 }}>What is your role?</Txt>
            <Txt variant="body" tone="muted" style={{ marginTop: space.sm, lineHeight: 23 }}>
              Your FRAC role determines which competencies you're measured against,
              and at what proficiency. Everything downstream follows from this.
            </Txt>

            <View style={{ gap: space.md, marginTop: space.xl }}>
              {ROLES.map((r) => {
                const sel = roleCode === r.code;
                return (
                  <Pressable
                    key={r.code}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setRoleCode(r.code); }}
                    style={{
                      padding: space.base,
                      borderRadius: radius.md,
                      backgroundColor: sel ? t.color.bgInverse : t.color.bgElevated,
                      borderWidth: 1.5,
                      borderColor: sel ? t.color.text : t.color.border,
                      ...(sel ? elevation(2, t.color.shadow) : {}),
                    }}
                  >
                    <Row justify="space-between">
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyMd" style={sel ? { color: onInv.strong } : undefined}>
                          {r.name}
                        </Txt>
                        <Txt variant="overline" style={{
                          color: sel ? onInv.subtle : t.color.textSubtle, marginTop: 3,
                        }}>
                          {r.code} · {r.grade.toUpperCase()}
                        </Txt>
                      </View>
                      {sel ? <Ionicons name="checkmark-circle" size={20} color={onInv.strong} /> : null}
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* ── STEP 1 · Posting ──────────────────────────────────────────── */}
        {step === 1 ? (
          <Animated.View entering={FadeInRight.duration(300)}>
            <Txt variant="overline" tone="muted">STEP 2 OF 4</Txt>
            <Txt variant="h1" style={{ marginTop: 6 }}>Where do you serve?</Txt>
            <Txt variant="body" tone="muted" style={{ marginTop: space.sm, lineHeight: 23 }}>
              Used to benchmark you against peers in comparable postings — and to
              roll your data into your Directorate's aggregate view.
            </Txt>

            <Txt variant="caption" tone="muted" style={{ marginTop: space.xl, marginBottom: space.sm }}>
              ORGANISATION
            </Txt>
            <View style={{ gap: space.sm }}>
              {ORGS.map((o) => {
                const sel = org === o;
                return (
                  <Pressable
                    key={o}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setOrg(o); }}
                    style={{
                      paddingVertical: space.md, paddingHorizontal: space.base,
                      borderRadius: radius.md,
                      backgroundColor: sel ? t.color.bgInverse : t.color.bgSunken,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: sel ? t.color.text : t.color.border,
                    }}
                  >
                    <Txt variant="body" style={sel ? { color: onInv.strong } : undefined} numberOfLines={2}>
                      {o}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>

            <Txt variant="caption" tone="muted" style={{ marginTop: space.lg, marginBottom: space.sm }}>
              DESIGNATION (as on your service record)
            </Txt>
            <TextInput
              value={designation}
              onChangeText={setDesignation}
              placeholder={role?.name ?? "Statistical Officer"}
              placeholderTextColor={t.color.textSubtle}
              style={{
                height: 52, borderRadius: radius.md,
                backgroundColor: t.color.bgSunken,
                borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
                paddingHorizontal: space.base, color: t.color.text, ...typo.body,
              }}
            />

            <Txt variant="caption" tone="muted" style={{ marginTop: space.lg, marginBottom: space.sm }}>
              YEARS OF SERVICE
            </Txt>
            <TextInput
              value={years}
              onChangeText={(v) => setYears(v.replace(/[^0-9]/g, "").slice(0, 2))}
              placeholder="7"
              placeholderTextColor={t.color.textSubtle}
              keyboardType="number-pad"
              style={{
                height: 52, borderRadius: radius.md,
                backgroundColor: t.color.bgSunken,
                borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
                paddingHorizontal: space.base, color: t.color.text, ...typo.body,
              }}
            />
          </Animated.View>
        ) : null}

        {/* ── STEP 2 · Self-rating ──────────────────────────────────────── */}
        {step === 2 ? (
          <Animated.View entering={FadeInRight.duration(300)}>
            <Txt variant="overline" tone="muted">STEP 3 OF 4</Txt>
            <Txt variant="h1" style={{ marginTop: 6 }}>Rate yourself</Txt>
            <Txt variant="body" tone="muted" style={{ marginTop: space.sm, lineHeight: 23 }}>
              Be honest rather than modest — this is a starting point, not a
              judgement. The diagnostic will confirm or correct every one of these.
            </Txt>

            <Card level={1} tone="sunken" style={{ marginTop: space.base }}>
              <Row gap={space.sm} align="flex-start">
                <Ionicons name="information-circle-outline" size={15}
                          color={t.color.textMuted} style={{ marginTop: 1 }} />
                <Txt variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
                  Self-report is the least reliable evidence we have, so we weight it
                  lightly — it sets a prior at low confidence. Answering real
                  questions is what actually moves your profile.
                </Txt>
              </Row>
            </Card>

            <View style={{ gap: space.lg, marginTop: space.xl }}>
              {SELF_RATE.map((c) => (
                <View key={c.code}>
                  <Row justify="space-between" style={{ marginBottom: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyMd">{c.label}</Txt>
                      <Txt variant="overline" tone="subtle" style={{ marginTop: 2 }}>
                        {c.family.toUpperCase()}
                      </Txt>
                    </View>
                    <Txt variant="caption" tone={ratings[c.code] != null ? "default" : "subtle"}>
                      {ratings[c.code] != null ? LEVELS[ratings[c.code]] : "—"}
                    </Txt>
                  </Row>
                  <Row gap={6}>
                    {LEVELS.map((_, i) => {
                      const sel = ratings[c.code] === i;
                      return (
                        <Pressable
                          key={i}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setRatings((r) => ({ ...r, [c.code]: i }));
                          }}
                          style={{
                            flex: 1, height: 38, borderRadius: radius.sm,
                            backgroundColor: sel ? t.color.bgInverse : t.color.bgSunken,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: sel ? t.color.text : t.color.border,
                            alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Txt variant="caption" style={sel ? { color: onInv.strong } : { color: t.color.textSubtle }}>
                            {i}
                          </Txt>
                        </Pressable>
                      );
                    })}
                  </Row>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {/* ── STEP 3 · Commitment + prior summary ───────────────────────── */}
        {step === 3 ? (
          <Animated.View entering={FadeInRight.duration(300)}>
            <Txt variant="overline" tone="muted">STEP 4 OF 4</Txt>
            <Txt variant="h1" style={{ marginTop: 6 }}>How much time?</Txt>
            <Txt variant="body" tone="muted" style={{ marginTop: space.sm, lineHeight: 23 }}>
              Consistency beats intensity. Twenty minutes daily outperforms three
              hours on a Sunday, because spacing is what moves knowledge into
              long-term memory.
            </Txt>

            <Row gap={space.sm} style={{ marginTop: space.xl }}>
              {[15, 25, 40, 60].map((m) => {
                const sel = goalMinutes === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setGoalMinutes(m); }}
                    style={{
                      flex: 1, paddingVertical: space.base, borderRadius: radius.md,
                      backgroundColor: sel ? t.color.bgInverse : t.color.bgSunken,
                      borderWidth: 1.5,
                      borderColor: sel ? t.color.text : t.color.border,
                      alignItems: "center",
                    }}
                  >
                    <Txt variant="h3" style={sel ? { color: onInv.strong } : undefined}>{m}</Txt>
                    <Txt variant="overline" style={{
                      color: sel ? onInv.subtle : t.color.textSubtle, marginTop: 2,
                    }}>MIN/DAY</Txt>
                  </Pressable>
                );
              })}
            </Row>

            {/* What we've inferred so far */}
            <Card level={2} style={{ marginTop: space.xl }}>
              <Txt variant="overline" tone="muted">YOUR STARTING PROFILE</Txt>
              <Txt variant="h3" style={{ marginTop: 6 }}>{role?.name}</Txt>
              <Txt variant="small" tone="muted" style={{ marginTop: 2 }} numberOfLines={2}>
                {org} · {years || "0"} years
              </Txt>

              <Divider style={{ marginVertical: space.base }} />

              <Row justify="space-between" style={{ marginBottom: 6 }}>
                <Txt variant="small" tone="muted">Estimate confidence</Txt>
                <Txt variant="small">{Math.round(priorConfidence * 100)}%</Txt>
              </Row>
              <ProgressBar value={priorConfidence} height={6} tone="warning" />

              <Txt variant="caption" tone="subtle" style={{ marginTop: space.md, lineHeight: 18 }}>
                Low, and correctly so — this is built from self-report and role
                defaults. Taking the diagnostic is what turns it into a measurement
                we'd stand behind, and what makes your recommendations trustworthy.
              </Txt>
            </Card>

            <Card level={1} tone="primary" style={{ marginTop: space.md }}>
              <Row gap={space.md}>
                <View style={{
                  width: 40, height: 40, borderRadius: radius.md,
                  backgroundColor: t.color.bgInverse,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name="clipboard-outline" size={19} color={t.color.textInverse} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyMd">Diagnostic assessment</Txt>
                  <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    ~20 questions · 15 minutes · adaptive
                  </Txt>
                </View>
              </Row>
              <Txt variant="caption" tone="subtle" style={{ marginTop: space.md, lineHeight: 18 }}>
                Questions adapt to your answers, so we reach a reliable estimate in
                fewer items than a fixed test would need. You can take it now or
                from your dashboard later.
              </Txt>
            </Card>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Bottom bar */}
      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        backgroundColor: t.color.bgElevated,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
        paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.xxl,
      }}>
        {step === TOTAL - 1 ? (
          <Row gap={space.sm}>
            <Button label="Later" variant="secondary" onPress={finish} style={{ flex: 1 }} size="lg" />
            <Button
              label="Start diagnostic"
              iconRight="arrow-forward"
              size="lg"
              style={{ flex: 2 }}
              onPress={async () => { await finish(); router.push("/assessment"); }}
            />
          </Row>
        ) : (
          <Button
            label="Continue"
            iconRight="arrow-forward"
            full size="lg"
            disabled={!canAdvance}
            onPress={next}
          />
        )}
        {!canAdvance && step < TOTAL - 1 ? (
          <Txt variant="caption" tone="subtle" center style={{ marginTop: space.sm }}>
            {step === 0 ? "Select your role to continue"
              : step === 1 ? "Organisation and years of service are required"
              : "Rate at least four competencies"}
          </Txt>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
