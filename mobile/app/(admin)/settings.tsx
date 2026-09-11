import React from "react";
import { View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius } from "../../src/theme";
import {
  Screen, Txt, Row, Card, Button, Badge, Divider, SectionHeader, useOnInverse,
} from "../../src/components/ui";
import { Appear } from "../../src/components/motion";
import { useSession } from "../../src/store/session";
import { isSupabaseConfigured } from "../../src/lib/supabase";

export default function AdminSettings() {
  const t = useTheme();
  const router = useRouter();
  const onInv = useOnInverse();
  const { profile, signOut, isDemo } = useSession();

  const doSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive",
        onPress: async () => { await signOut(); router.replace("/(auth)/sign-in"); } },
    ]);
  };

  return (
    <Screen>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <Txt variant="overline" tone="muted">ADMINISTRATOR</Txt>
        <Txt variant="h1" style={{ marginTop: 2 }}>Settings</Txt>
      </View>

      <Appear from="scale">
        <View style={{
          borderRadius: radius.xl, padding: space.lg,
          backgroundColor: t.color.bgInverse,
        }}>
          <Row gap={space.base}>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: onInv.fill,
              borderWidth: 1.5, borderColor: onInv.hairline,
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="shield-checkmark" size={24} color={onInv.strong} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="h3" style={{ color: onInv.strong }} numberOfLines={1}>
                {profile?.full_name ?? "Administrator"}
              </Txt>
              <Txt variant="small" style={{ color: onInv.muted }}>
                {profile?.designation ?? "Platform Administrator"}
              </Txt>
            </View>
          </Row>
        </View>
      </Appear>

      <SectionHeader title="System" icon="server-outline" />
      <Card level={1}>
        <StatusRow label="Supabase" value={isDemo ? "Demo mode" : isSupabaseConfigured ? "Connected" : "Not configured"}
                   ok={!isDemo && isSupabaseConfigured} />
        <Divider style={{ marginVertical: space.md }} />
        <StatusRow label="Text model" value="deepseek-v4-flash" ok />
        <Divider style={{ marginVertical: space.md }} />
        <StatusRow label="Vision model" value="kimi-k2.5" ok />
        <Divider style={{ marginVertical: space.md }} />
        <StatusRow label="iGOT Karmayogi" value="Simulator (real contract)" ok={false} />
      </Card>

      <SectionHeader title="Access control" icon="key-outline" />
      <Card level={1}>
        <Txt variant="small" tone="muted" style={{ lineHeight: 21 }}>
          Officers cannot self-register. Every account is provisioned by an administrator
          against a verified employee ID, which is what ties each competency record to a
          real post rather than to whoever typed an email address.
        </Txt>
        <Divider style={{ marginVertical: space.md }} />
        <Row gap={space.sm} align="flex-start">
          <Ionicons name="shield-outline" size={15} color={t.color.textMuted} style={{ marginTop: 1 }} />
          <Txt variant="caption" tone="subtle" style={{ flex: 1, lineHeight: 18 }}>
            Accounts are created pre-confirmed — there is no verification email. In a
            department the administrator handing over credentials is the verification step,
            and waiting on a shared inbox reliably stalls a rollout.
          </Txt>
        </Row>
        <Button label="Manage officers" variant="secondary" icon="people" size="sm" full
                style={{ marginTop: space.base }}
                onPress={() => router.push("/(admin)/officers")} />
      </Card>

      <SectionHeader title="Privacy" icon="lock-closed-outline" />
      <Card level={1}>
        <Txt variant="small" tone="muted" style={{ lineHeight: 21 }}>
          Row Level Security restricts every query to your own organisation, and the
          aggregate dashboards read a view that groups before it returns rows — so no query
          path from the Overview screen can reach an individual officer's record.
        </Txt>
      </Card>

      <Button label="Sign out" variant="secondary" icon="log-out-outline" full
              onPress={doSignOut} style={{ marginTop: space.xl }} />

      <Txt variant="caption" tone="subtle" center style={{ marginTop: space.lg }}>
        Samiksha Administrator · SIH 2026
      </Txt>
    </Screen>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  const t = useTheme();
  return (
    <Row justify="space-between" align="center">
      <Txt variant="body" tone="muted">{label}</Txt>
      <Row gap={6}>
        <View style={{
          width: 7, height: 7, borderRadius: 4,
          backgroundColor: ok ? t.color.success : t.color.warning,
        }} />
        <Txt variant="small">{value}</Txt>
      </Row>
    </Row>
  );
}
