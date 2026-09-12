/**
 * Officer roster.
 *
 * The list an administrator actually works from: who is online, who has gone
 * quiet, where each person is weakest and what they have been told to do next
 * — without having to open eight separate records to find out.
 *
 * Sorted by presence first, because "who is using this right now" is the
 * question an admin opens the screen to answer.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View, TextInput, StyleSheet, RefreshControl, Modal, ScrollView, Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTheme, space, radius, type as typo, elevation } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, Chip, Divider, EmptyState, Loading,
} from "../../src/components/ui";
import { Appear, Stagger, Squish, CountUp, GrowBar } from "../../src/components/motion";
import { useSession } from "../../src/store/session";
import { notify } from "../../src/lib/dialog";
import {
  listOfficers, createOfficer, resetOfficerPassword, setOfficerActive,
  type OfficerOverview,
} from "../../src/lib/api";

type Filter = "all" | "online" | "at_risk" | "inactive";

const ROLE_OPTIONS = [
  { code: "FI",  label: "Field Investigator" },
  { code: "JSO", label: "Junior Statistical Officer" },
  { code: "SSO", label: "Senior Statistical Officer" },
  { code: "ASD", label: "Assistant Director" },
  { code: "DD",  label: "Deputy Director" },
  { code: "DIR", label: "Director" },
];

function relative(iso: string | null): string {
  if (!iso) return "never";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const ACTIVITY_LABEL: Record<string, string> = {
  reviewing: "reviewing flashcards", quiz: "taking a quiz", reading: "reading material",
  video: "watching a video", tutor: "with the AI tutor", assessment: "in an assessment",
  browsing: "browsing", idle: "idle",
};

export default function Officers() {
  const t = useTheme();
  const router = useRouter();
  const { isDemo, loading: sessionLoading } = useSession();

  const [officers, setOfficers] = useState<OfficerOverview[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setOfficers(await listOfficers(isDemo));
    } catch (e) {
      setError((e as Error).message);
      setOfficers([]);
    }
  }, [isDemo]);

  // Wait for the session to resolve before fetching. Firing while auth state
  // is still settling means calling the Edge Function without a JWT — which
  // fails in live mode and wrongly bypasses the demo dataset in demo mode.
  React.useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [load, sessionLoading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const list = officers ?? [];
    const q = query.trim().toLowerCase();
    const presenceRank = { online: 0, away: 1, offline: 2 } as Record<string, number>;

    return list
      .filter((o) => {
        if (filter === "online")   return o.presence === "online" || o.presence === "away";
        // "At risk" is the cohort an admin needs to act on: a critical gap
        // plus no study time this week. Either alone is normal; together it
        // is someone quietly falling behind.
        if (filter === "at_risk")  return o.critical_gaps > 0 && o.minutes_last_7d < 30;
        if (filter === "inactive") return !o.is_active || !o.onboarded_at;
        return true;
      })
      .filter((o) => !q ||
        (o.full_name ?? "").toLowerCase().includes(q) ||
        (o.employee_code ?? "").toLowerCase().includes(q) ||
        (o.email ?? "").toLowerCase().includes(q) ||
        (o.top_gap_name ?? "").toLowerCase().includes(q))
      .sort((a, b) =>
        (presenceRank[a.presence] ?? 3) - (presenceRank[b.presence] ?? 3) ||
        b.critical_gaps - a.critical_gaps);
  }, [officers, query, filter]);

  const counts = useMemo(() => {
    const l = officers ?? [];
    return {
      total: l.length,
      online: l.filter((o) => o.presence === "online").length,
      atRisk: l.filter((o) => o.critical_gaps > 0 && o.minutes_last_7d < 30).length,
    };
  }, [officers]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.color.text} />}>
      <Row justify="space-between" align="flex-start" style={{ marginTop: space.sm, marginBottom: space.base }}>
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="muted">ROSTER</Txt>
          <Txt variant="h1" style={{ marginTop: 2 }}>Officers</Txt>
        </View>
        <Squish onPress={() => setShowCreate(true)} haptic="medium">
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 6,
            height: 40, paddingHorizontal: space.base, borderRadius: radius.pill,
            backgroundColor: t.color.bgInverse, ...elevation(2, t.color.shadow),
          }}>
            <Ionicons name="person-add" size={15} color={t.color.textInverse} />
            <Txt variant="caption" style={{ color: t.color.textInverse }}>ADD</Txt>
          </View>
        </Squish>
      </Row>

      {/* Live counts */}
      <Row gap={space.md} style={{ marginBottom: space.base }}>
        <Card level={1} style={{ flex: 1, alignItems: "center", paddingVertical: space.md }}>
          <CountUp value={counts.total} variant="h2" />
          <Txt variant="overline" tone="subtle">TOTAL</Txt>
        </Card>
        <Card level={1} style={{ flex: 1, alignItems: "center", paddingVertical: space.md }}>
          <Row gap={6} align="center">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.color.success }} />
            <CountUp value={counts.online} variant="h2" delay={80} />
          </Row>
          <Txt variant="overline" tone="subtle">ONLINE</Txt>
        </Card>
        <Card level={1} style={{ flex: 1, alignItems: "center", paddingVertical: space.md }}>
          <CountUp value={counts.atRisk} variant="h2" delay={160} />
          <Txt variant="overline" tone="subtle">AT RISK</Txt>
        </Card>
      </Row>

      {/* Search */}
      <View style={{ position: "relative", marginBottom: space.md }}>
        <Ionicons name="search" size={17} color={t.color.textSubtle}
                  style={{ position: "absolute", left: space.md, top: 15, zIndex: 1 }} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name, employee ID, or competency gap…"
          placeholderTextColor={t.color.textSubtle}
          style={{
            height: 48, borderRadius: radius.md,
            backgroundColor: t.color.bgSunken,
            borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
            paddingLeft: 42, paddingRight: space.base,
            color: t.color.text, ...typo.body,
          }}
        />
      </View>

      <Row gap={space.sm} wrap style={{ marginBottom: space.base }}>
        {([["all","All"],["online","Active now"],["at_risk","At risk"],["inactive","Not started"]] as [Filter,string][])
          .map(([f, label]) => (
            <Chip key={f} label={label} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
      </Row>

      {error ? (
        <Card level={1} style={{ marginBottom: space.base }}>
          <Row gap={space.sm} align="flex-start">
            <Ionicons name="alert-circle" size={16} color={t.color.danger} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyMd" tone="danger">Could not load the roster</Txt>
              <Txt variant="caption" tone="muted" style={{ marginTop: 3 }}>{error}</Txt>
            </View>
          </Row>
        </Card>
      ) : null}

      {officers === null ? <Loading label="Loading roster…" /> : null}

      {officers !== null && filtered.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={query ? "No match" : "No officers yet"}
          body={query
            ? "Nothing matches that search."
            : "Provision the first officer account to get started."}
          actionLabel={query ? undefined : "Add officer"}
          onAction={query ? undefined : () => setShowCreate(true)}
        />
      ) : null}

      <View style={{ gap: space.md }}>
        {filtered.map((o, i) => (
          <Appear key={o.user_id} delay={i * 45} from="bottom">
            <OfficerRow officer={o} onPress={() => router.push(`/(admin)/officer/${o.user_id}`)} />
          </Appear>
        ))}
      </View>

      <CreateOfficerSheet
        visible={showCreate}
        isDemo={isDemo}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); load(); }}
      />
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function OfficerRow({ officer: o, onPress }: { officer: OfficerOverview; onPress: () => void }) {
  const t = useTheme();
  const dot = o.presence === "online" ? t.color.success
            : o.presence === "away"   ? t.color.warning
            : t.color.border;
  const initials = (o.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const readiness = o.competencies_mapped > 0 ? o.competencies_met / o.competencies_mapped : 0;

  return (
    <Card level={1} onPress={onPress} style={!o.is_active ? { opacity: 0.55 } : undefined}>
      <Row gap={space.md} align="flex-start">
        <View>
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: t.color.bgSunken,
            alignItems: "center", justifyContent: "center",
          }}>
            <Txt variant="bodyMd">{initials}</Txt>
          </View>
          <View style={{
            position: "absolute", right: -1, bottom: -1,
            width: 13, height: 13, borderRadius: 7,
            backgroundColor: dot,
            borderWidth: 2.5, borderColor: t.color.bgElevated,
          }} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1, marginRight: space.sm }}>
              <Txt variant="bodyMd" numberOfLines={1}>{o.full_name ?? "Unnamed"}</Txt>
              <Txt variant="overline" tone="subtle" style={{ marginTop: 2 }} numberOfLines={1}>
                {o.employee_code ?? "NO ID"} · {(o.role_name ?? "no role").toUpperCase()}
              </Txt>
            </View>
            {!o.is_active ? <Badge label="DISABLED" tone="neutral" size="sm" />
              : o.critical_gaps > 0 ? <Badge label={`${o.critical_gaps} CRIT`} tone="danger" size="sm" />
              : <Ionicons name="checkmark-circle" size={18} color={t.color.success} />}
          </Row>

          {/* What they are doing right now — the thing an admin opens this for */}
          {o.presence !== "offline" && o.current_activity ? (
            <Row gap={5} style={{ marginTop: 6 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dot }} />
              <Txt variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                {ACTIVITY_LABEL[o.current_activity] ?? o.current_activity}
                {o.current_entity ? ` · ${o.current_entity}` : ""}
              </Txt>
            </Row>
          ) : (
            <Txt variant="caption" tone="subtle" style={{ marginTop: 6 }}>
              last seen {relative(o.last_seen_at ?? o.last_login_at)}
            </Txt>
          )}

          <View style={{ marginTop: space.md }}>
            <Row justify="space-between" style={{ marginBottom: 5 }}>
              <Txt variant="overline" tone="subtle">
                {o.competencies_met}/{o.competencies_mapped} COMPETENCIES MET
              </Txt>
              <Txt variant="overline" tone="subtle">{o.minutes_last_7d} MIN / 7D</Txt>
            </Row>
            <GrowBar value={readiness} height={6}
                     color={readiness > 0.7 ? t.color.success : t.color.text} />
          </View>

          {o.top_gap_name ? (
            <Row gap={5} style={{ marginTop: space.sm }} align="flex-start">
              <Ionicons name="trending-down" size={11} color={t.color.textSubtle} style={{ marginTop: 2 }} />
              <Txt variant="caption" tone="subtle" numberOfLines={1} style={{ flex: 1 }}>
                Weakest: {o.top_gap_name}
              </Txt>
            </Row>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CREATE OFFICER
// ─────────────────────────────────────────────────────────────────────────────
function CreateOfficerSheet({
  visible, isDemo, onClose, onCreated,
}: { visible: boolean; isDemo: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTheme();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [roleCode, setRoleCode] = useState("JSO");
  const [years, setYears] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string | null } | null>(null);

  const reset = () => {
    setFullName(""); setEmail(""); setEmployeeCode(""); setRoleCode("JSO");
    setYears(""); setErr(null); setResult(null);
  };

  const submit = async () => {
    setErr(null);
    if (fullName.trim().length < 2) return setErr("Full name is required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("Enter a valid email address.");
    if (!employeeCode.trim()) return setErr("Employee ID is required.");

    if (isDemo) {
      setResult({ email: email.trim(), password: "DemoTempPass42" });
      return;
    }

    setBusy(true);
    try {
      const res = await createOfficer({
        email: email.trim(),
        full_name: fullName.trim(),
        employee_code: employeeCode.trim(),
        job_role_code: roleCode,
        designation: ROLE_OPTIONS.find((r) => r.code === roleCode)?.label,
        years_of_service: years ? Number(years) : undefined,
      });
      setResult({ email: res.email, password: res.temporary_password });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = {
    height: 50, borderRadius: radius.md,
    backgroundColor: t.color.bgSunken,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
    paddingHorizontal: space.base, color: t.color.text, ...typo.body,
  } as const;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
           onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.color.bg }}>
        <Row justify="space-between" style={{ padding: space.base, paddingTop: space.lg }}>
          <Txt variant="h3">{result ? "Account created" : "Add officer"}</Txt>
          <Pressable onPress={() => { reset(); onClose(); }} hitSlop={10}>
            <Ionicons name="close" size={22} color={t.color.textMuted} />
          </Pressable>
        </Row>
        <Divider />

        <ScrollView contentContainerStyle={{ padding: space.base, paddingBottom: space.huge }}
                    keyboardShouldPersistTaps="handled">
          {result ? (
            <Appear from="scale">
              <Card level={2} style={{ alignItems: "center", paddingVertical: space.xl }}>
                <View style={{
                  width: 60, height: 60, borderRadius: 30,
                  backgroundColor: t.color.successSoft,
                  alignItems: "center", justifyContent: "center", marginBottom: space.base,
                }}>
                  <Ionicons name="checkmark" size={30} color={t.color.success} />
                </View>
                <Txt variant="h3" center>Hand these over</Txt>
                <Txt variant="small" tone="muted" center style={{ marginTop: 6, maxWidth: 300 }}>
                  The temporary password is shown once and is never retrievable again.
                  The officer will be asked to change it at first sign-in.
                </Txt>

                <View style={{
                  marginTop: space.lg, width: "100%",
                  padding: space.base, borderRadius: radius.md,
                  backgroundColor: t.color.bgSunken,
                }}>
                  <Txt variant="overline" tone="subtle">EMAIL</Txt>
                  <Txt variant="bodyMd" style={{ marginTop: 2 }} selectable>{result.email}</Txt>
                  <Divider style={{ marginVertical: space.md }} />
                  <Txt variant="overline" tone="subtle">TEMPORARY PASSWORD</Txt>
                  <Row justify="space-between" align="center" style={{ marginTop: 2 }}>
                    <Txt variant="h3" selectable>{result.password}</Txt>
                    <Pressable
                      hitSlop={10}
                      onPress={() => {
                        Clipboard.setStringAsync(
                          `Email: ${result.email}\nPassword: ${result.password}`,
                        ).catch(() => {});
                        notify("Copied", "Credentials copied to clipboard.");
                      }}
                    >
                      <Ionicons name="copy-outline" size={20} color={t.color.textMuted} />
                    </Pressable>
                  </Row>
                </View>

                <Button label="Done" full size="lg" style={{ marginTop: space.xl }}
                        onPress={() => { reset(); onCreated(); }} />
              </Card>
            </Appear>
          ) : (
            <View style={{ gap: space.base }}>
              <Card level={1} tone="sunken">
                <Row gap={space.sm} align="flex-start">
                  <Ionicons name="information-circle-outline" size={15}
                            color={t.color.textMuted} style={{ marginTop: 1 }} />
                  <Txt variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
                    Officers do not self-register. Creating the account against a verified
                    employee ID is what ties the competency record to a real post — and keeps
                    anyone with the APK out of your ministry's statistics.
                  </Txt>
                </Row>
              </Card>

              <View>
                <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>FULL NAME</Txt>
                <TextInput value={fullName} onChangeText={setFullName}
                           placeholder="Ananya Deshmukh" placeholderTextColor={t.color.textSubtle}
                           autoCapitalize="words" style={input} />
              </View>

              <View>
                <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>OFFICIAL EMAIL</Txt>
                <TextInput value={email} onChangeText={setEmail}
                           placeholder="officer@des.mh.gov.in" placeholderTextColor={t.color.textSubtle}
                           autoCapitalize="none" keyboardType="email-address" style={input} />
              </View>

              <View>
                <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>EMPLOYEE ID</Txt>
                <TextInput value={employeeCode} onChangeText={(v) => setEmployeeCode(v.toUpperCase())}
                           placeholder="MH-JSO-4471" placeholderTextColor={t.color.textSubtle}
                           autoCapitalize="characters" style={input} />
                <Txt variant="caption" tone="subtle" style={{ marginTop: 5 }}>
                  Must be unique. This is how the officer is identified in the department.
                </Txt>
              </View>

              <View>
                <Txt variant="caption" tone="muted" style={{ marginBottom: 8 }}>FRAC ROLE</Txt>
                <Row gap={space.sm} wrap>
                  {ROLE_OPTIONS.map((r) => (
                    <Chip key={r.code} label={r.code} selected={roleCode === r.code}
                          onPress={() => setRoleCode(r.code)} />
                  ))}
                </Row>
                <Txt variant="caption" tone="subtle" style={{ marginTop: 6 }}>
                  {ROLE_OPTIONS.find((r) => r.code === roleCode)?.label} — determines which
                  competencies they are measured against.
                </Txt>
              </View>

              <View>
                <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>YEARS OF SERVICE</Txt>
                <TextInput value={years}
                           onChangeText={(v) => setYears(v.replace(/[^0-9]/g, "").slice(0, 2))}
                           placeholder="7" placeholderTextColor={t.color.textSubtle}
                           keyboardType="number-pad" style={input} />
              </View>

              {err ? (
                <Row gap={space.sm} align="flex-start" style={{
                  padding: space.md, borderRadius: radius.sm, backgroundColor: t.color.dangerSoft,
                }}>
                  <Ionicons name="alert-circle" size={15} color={t.color.danger} style={{ marginTop: 1 }} />
                  <Txt variant="small" tone="danger" style={{ flex: 1 }}>{err}</Txt>
                </Row>
              ) : null}

              <Button label="Create account" full size="lg" loading={busy}
                      icon="person-add" onPress={submit} style={{ marginTop: space.sm }} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
