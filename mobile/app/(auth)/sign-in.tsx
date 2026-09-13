import React, { useState } from "react";
import {
  View, TextInput, KeyboardAvoidingView, Platform, ScrollView,
  Pressable, StyleSheet, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, space, radius, type as typo, elevation } from "../../src/theme";
import { Txt, Row, Button, Card, Divider, useOnInverse } from "../../src/components/ui";
import { useSession } from "../../src/store/session";
import { isSupabaseConfigured } from "../../src/lib/supabase";
import { IS_ADMIN_BUILD, IS_DEMO_BUILD } from "../../src/lib/variant";

export default function SignIn() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { signIn, signUp, enterDemo } = useSession();
  const onInv = useOnInverse();

  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (mode === "up" && fullName.trim().length < 2) return setError("Please enter your name.");

    setBusy(true);
    const res = mode === "in"
      ? await signIn(email, password)
      : await signUp(email, password, fullName);
    setBusy(false);

    if (res.error) { setError(res.error); return; }
    if (mode === "up") {
      setError(null);
      setMode("in");
      setError("Account created. Check your email to confirm, then sign in.");
      return;
    }
    router.replace("/(tabs)");
  };

  const goDemo = async (asAdmin = false) => {
    await enterDemo(asAdmin);
    router.replace(asAdmin ? "/(admin)" : "/(tabs)");
  };

  const inputStyle = {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: t.color.bgSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.color.border,
    paddingHorizontal: space.base,
    color: t.color.text,
    ...typo.body,
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.color.bg }}>
      {/* Inverted hero — the one full-bleed surface in the app. Black on
          white (or white on black); no gradient, no colour. */}
      <View style={{
        height: width > 400 ? 300 : 268,
        backgroundColor: t.color.bgInverse,
        justifyContent: "flex-end",
      }}>
        <SafeAreaView edges={["top"]}>
          <Animated.View entering={FadeIn.duration(500)} style={{ padding: space.xl, paddingBottom: space.xxl }}>
            <Row gap={space.md} style={{ marginBottom: space.lg }}>
              <View style={{
                width: 48, height: 48, borderRadius: 14,
                backgroundColor: onInv.fill,
                alignItems: "center", justifyContent: "center",
                borderWidth: 1, borderColor: onInv.hairline,
              }}>
                <Ionicons name="analytics" size={25} color={onInv.strong} />
              </View>
              <View>
                <Txt variant="h1" style={{ color: onInv.strong }}>Samiksha</Txt>
                <Txt variant="caption" style={{ color: onInv.muted }}>
                  समीक्षा · Capacity Building Platform
                </Txt>
              </View>
            </Row>

            <Txt variant="bodyLg" style={{ color: onInv.strong, maxWidth: 330, opacity: 0.92 }}>
              AI-powered competency development for India's Official Statistical System.
            </Txt>

            <Row gap={space.sm} wrap style={{ marginTop: space.base }}>
              {["MoSPI", "NSSTA", "iGOT Karmayogi"].map((x) => (
                <View key={x} style={{
                  paddingHorizontal: space.md, paddingVertical: 5,
                  borderRadius: radius.pill, backgroundColor: onInv.fill,
                  borderWidth: 1, borderColor: onInv.hairline,
                }}>
                  <Txt variant="overline" style={{ color: onInv.strong }}>{x.toUpperCase()}</Txt>
                </View>
              ))}
            </Row>
          </Animated.View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, marginTop: -space.xl }}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.base, paddingBottom: space.huge }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(120).duration(420)}>
            <Card level={3} style={{ padding: space.lg, borderRadius: radius.xl }}>
              <Txt variant="h2">{mode === "in" ? "Welcome back" : "Create your account"}</Txt>
              <Txt variant="small" tone="muted" style={{ marginTop: 4, marginBottom: space.lg }}>
                {mode === "in"
                  ? "Sign in to continue your development plan."
                  : "Set up your profile to get a personalised plan."}
              </Txt>

              <View style={{ gap: space.md }}>
                {mode === "up" ? (
                  <View>
                    <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>FULL NAME</Txt>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Ananya Deshmukh"
                      placeholderTextColor={t.color.textSubtle}
                      autoCapitalize="words"
                      style={inputStyle}
                    />
                  </View>
                ) : null}

                <View>
                  <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>EMAIL</Txt>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="officer@gov.in"
                    placeholderTextColor={t.color.textSubtle}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    style={inputStyle}
                  />
                </View>

                <View>
                  <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>PASSWORD</Txt>
                  <View>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor={t.color.textSubtle}
                      secureTextEntry={!showPw}
                      autoCapitalize="none"
                      style={[inputStyle, { paddingRight: 48 }]}
                    />
                    <Pressable
                      onPress={() => setShowPw((s) => !s)}
                      hitSlop={10}
                      style={{ position: "absolute", right: space.md, top: 16 }}
                    >
                      <Ionicons
                        name={showPw ? "eye-off-outline" : "eye-outline"}
                        size={20} color={t.color.textSubtle}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              {error ? (
                <Animated.View entering={FadeIn.duration(200)}>
                  <Row gap={space.sm} align="flex-start" style={{
                    marginTop: space.md, padding: space.md,
                    borderRadius: radius.sm, backgroundColor: t.color.dangerSoft,
                  }}>
                    <Ionicons name="alert-circle" size={16} color={t.color.danger} style={{ marginTop: 1 }} />
                    <Txt variant="small" tone="danger" style={{ flex: 1 }}>{error}</Txt>
                  </Row>
                </Animated.View>
              ) : null}

              <Button
                label={mode === "in" ? "Sign in" : "Create account"}
                onPress={submit}
                loading={busy}
                full
                size="lg"
                style={{ marginTop: space.lg }}
                iconRight="arrow-forward"
              />

              <Pressable
                onPress={() => { setMode((m) => (m === "in" ? "up" : "in")); setError(null); }}
                style={{ marginTop: space.base, alignSelf: "center" }}
                hitSlop={8}
              >
                <Txt variant="small" tone="muted">
                  {mode === "in" ? "New here? " : "Already registered? "}
                  <Txt variant="small" tone="primary" style={{ fontWeight: "700" }}>
                    {mode === "in" ? "Create an account" : "Sign in"}
                  </Txt>
                </Txt>
              </Pressable>
            </Card>
          </Animated.View>

          {/* Demo entry — also the offline fallback for live judging */}
          <Animated.View entering={FadeInDown.delay(220).duration(420)} style={{ marginTop: space.lg }}>
            <Row gap={space.md} style={{ marginBottom: space.md }}>
              <Divider style={{ flex: 1 }} />
              <Txt variant="overline" tone="subtle">OR</Txt>
              <Divider style={{ flex: 1 }} />
            </Row>

            {!IS_ADMIN_BUILD || IS_DEMO_BUILD ? (
            <Card
              level={1}
              tone="primary"
              onPress={() => goDemo(false)}
              style={{ borderStyle: "dashed", borderWidth: 1.5, borderColor: t.color.borderStrong }}
            >
              <Row gap={space.md}>
                <View style={{
                  width: 42, height: 42, borderRadius: radius.md,
                  backgroundColor: t.color.bgInverse, alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name="person" size={19} color={t.color.textInverse} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyMd">Officer demo</Txt>
                  <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    Learning plan · assigned material · ask Samiksha AI
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.color.textMuted} />
              </Row>
            </Card>
            ) : null}

            <Card
              level={1}
              tone={IS_ADMIN_BUILD ? "primary" : undefined}
              onPress={() => goDemo(true)}
              style={{
                marginTop: IS_ADMIN_BUILD && !IS_DEMO_BUILD ? 0 : space.md,
                borderStyle: "dashed", borderWidth: 1.5, borderColor: t.color.borderStrong,
              }}
            >
              <Row gap={space.md}>
                <View style={{
                  width: 42, height: 42, borderRadius: radius.md,
                  backgroundColor: t.color.bgSunken, alignItems: "center", justifyContent: "center",
                  borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.borderStrong,
                }}>
                  <Ionicons name="shield-checkmark" size={19} color={t.color.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyMd">Administrator demo</Txt>
                  <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    Workforce data · publish material · AI operator
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.color.textMuted} />
              </Row>
            </Card>

            {!isSupabaseConfigured ? (
              <Row gap={space.sm} align="flex-start" style={{
                marginTop: space.md, padding: space.md,
                borderRadius: radius.sm, backgroundColor: t.color.warningSoft,
              }}>
                <Ionicons name="information-circle" size={16} color={t.color.warning} style={{ marginTop: 1 }} />
                <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
                  Supabase isn't configured yet. Run <Txt variant="caption" tone="primary">npm run env:sync</Txt> at
                  the repo root, then restart. Demo mode works regardless.
                </Txt>
              </Row>
            ) : null}
          </Animated.View>

          <Txt variant="caption" tone="subtle" center style={{ marginTop: space.xl }}>
            Smart India Hackathon 2026 · Problem Statement SIH26101
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
