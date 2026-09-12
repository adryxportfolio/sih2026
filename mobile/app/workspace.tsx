import React, { useRef, useState } from "react";
import { View, ActivityIndicator, Platform, Linking } from "react-native";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, space, radius } from "../src/theme";
import { Txt, Row, IconButton, Button, Card } from "../src/components/ui";
import { useSession } from "../src/store/session";

/**
 * The officer's AI workspace, opened from the mascot.
 *
 * Samiksha's two halves answer different questions. The tutor answers "help me
 * understand this"; the workspace answers "do this for me". Keeping them one tap
 * apart is the point — the moment an officer is about to hand work over is
 * exactly the moment the platform learns which competency they are leaning on.
 *
 * The desktop app is where the agents do their heavy work, because browsers,
 * terminals and file systems live there. On a phone this is the same workspace
 * for the part that travels well: reading what an agent produced, replying to
 * it, and starting something off.
 */
function env(key: string): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return process.env[key] ?? (extra[key] as string | undefined);
}

const WORKSPACE_URL = env("EXPO_PUBLIC_WORKSPACE_URL");

export default function Workspace() {
  const t = useTheme();
  const router = useRouter();
  const { setActivity } = useSession();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  React.useEffect(() => { setActivity("tutor", "AI workspace"); }, [setActivity]);

  // onLoadEnd is not delivered by every react-native-webview backend (the web
  // build renders a bare iframe and fires nothing), so a spinner that waits for
  // it can hang forever on a page that actually loaded. Time it out instead and
  // let onError, which is reliable, be the thing that reports genuine failure.
  React.useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(timer);
  }, [loading]);

  const header = (
    <Row justify="space-between" align="center"
         style={{ paddingHorizontal: space.base, paddingVertical: space.sm }}>
      <Row align="center" gap={space.sm}>
        <IconButton icon="chevron-back" tone="plain" onPress={() => router.back()} />
        <View>
          <Txt variant="h3">AI Workspace</Txt>
          <Txt variant="overline" tone="subtle">YOUR AGENT TEAM</Txt>
        </View>
      </Row>
      {WORKSPACE_URL && !failed ? (
        <IconButton icon="refresh" tone="plain" onPress={() => webRef.current?.reload()} />
      ) : null}
    </Row>
  );

  // react-native-webview is native-only — it renders a hard error on web rather
  // than an iframe. The APK is the real target, but the browser is where this
  // gets reviewed, so hand off to a real tab there instead of showing a crash.
  if (WORKSPACE_URL && Platform.OS === "web") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={["top"]}>
        {header}
        <View style={{ flex: 1, padding: space.base, justifyContent: "center" }}>
          <Card level={1} style={{ padding: space.lg }}>
            <Ionicons name="hardware-chip-outline" size={28} color={t.color.text} />
            <Txt variant="h3" style={{ marginTop: space.md }}>Your agent team</Txt>
            <Txt variant="bodyMd" tone="subtle" style={{ marginTop: space.sm }}>
              Data Quality, Data Analyst and Report Assistant are standing by. They know which
              competencies you are below the bar on, and explain the step that matters while
              they work.
            </Txt>
            <Txt variant="small" tone="subtle" style={{ marginTop: space.md }}>
              On your phone the workspace opens inside Samiksha. In a browser it opens in its
              own tab.
            </Txt>
            <Button label="Open workspace" icon="open-outline" full
                    style={{ marginTop: space.lg }}
                    onPress={() => Linking.openURL(WORKSPACE_URL)} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  // Without a configured deployment there is nothing honest to show, so say what
  // the workspace is and where it runs rather than rendering a broken frame.
  if (!WORKSPACE_URL || failed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={["top"]}>
        {header}
        <View style={{ flex: 1, padding: space.base, justifyContent: "center" }}>
          <Card level={1} style={{ padding: space.lg }}>
            <Ionicons name="hardware-chip-outline" size={28} color={t.color.text} />
            <Txt variant="h3" style={{ marginTop: space.md }}>
              {failed ? "Workspace unreachable" : "Workspace not connected"}
            </Txt>
            <Txt variant="bodyMd" tone="subtle" style={{ marginTop: space.sm }}>
              {failed
                ? "The workspace server did not respond. It runs on your department's machine, so it has to be running and on the same network."
                : "Your AI agents run in the Samiksha desktop workspace. Once your department connects it, you can reach your agents from here too."}
            </Txt>
            <Txt variant="small" tone="subtle" style={{ marginTop: space.md }}>
              Agents handle the repetitive parts of your work — checking a dataset, computing the
              standard indicators, drafting the periodic report — and sign in with these same
              credentials.
            </Txt>
            {failed ? (
              <Button label="Try again" full style={{ marginTop: space.lg }}
                      onPress={() => { setFailed(false); setLoading(true); }} />
            ) : null}
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={["top"]}>
      {header}
      <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: t.color.border }}>
        <WebView
          ref={webRef}
          source={{ uri: WORKSPACE_URL }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setFailed(true); setLoading(false); }}
          onHttpError={() => { setFailed(true); setLoading(false); }}
          // The workspace keeps a session cookie; without shared storage the
          // officer would be asked to sign in on every visit.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          originWhitelist={["*"]}
          style={{ flex: 1, backgroundColor: t.color.bg }}
        />
        {loading ? (
          <View style={{
            ...StyleSheetAbsolute, alignItems: "center", justifyContent: "center",
            backgroundColor: t.color.bg,
          }}>
            <ActivityIndicator color={t.color.text} />
            <Txt variant="small" tone="subtle" style={{ marginTop: space.md }}>
              Opening your workspace…
            </Txt>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const StyleSheetAbsolute = {
  position: "absolute" as const,
  top: 0, left: 0, right: 0, bottom: 0,
};
