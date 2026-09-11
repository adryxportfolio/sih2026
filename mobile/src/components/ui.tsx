/**
 * Samiksha UI kit.
 *
 * Primitives that every screen composes from, so spacing, type and motion
 * stay consistent without each screen re-deciding them.
 */
import React, { useCallback } from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet,
  type ViewStyle, type TextStyle, type StyleProp, Platform,
  type RefreshControlProps,
} from "react-native";
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
  FadeIn, FadeInDown,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius, type as typo, elevation, motion } from "../theme";
import { CountUp, Squish, GrowBar } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─────────────────────────────────────────────────────────────────────────────
//  TEXT
// ─────────────────────────────────────────────────────────────────────────────
type TxtVariant = keyof typeof typo;
type TxtTone = "default" | "muted" | "subtle" | "inverse" | "primary" | "success" | "danger" | "warning";

export function Txt({
  children, variant = "body", tone = "default", style, numberOfLines, center, ...rest
}: {
  children: React.ReactNode;
  variant?: TxtVariant;
  tone?: TxtTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
} & React.ComponentProps<typeof Text>) {
  const t = useTheme();
  const toneColor = {
    default: t.color.text, muted: t.color.textMuted, subtle: t.color.textSubtle,
    inverse: t.color.textInverse, primary: t.color.primary,
    success: t.color.success, danger: t.color.danger, warning: t.color.warning,
  }[tone];

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[typo[variant], { color: toneColor }, center && { textAlign: "center" }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
export function Row({
  children, gap = space.sm, align = "center", justify = "flex-start", wrap, style,
}: {
  children: React.ReactNode; gap?: number;
  align?: ViewStyle["alignItems"]; justify?: ViewStyle["justifyContent"];
  wrap?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{
      flexDirection: "row", alignItems: align, justifyContent: justify,
      gap, flexWrap: wrap ? "wrap" : "nowrap",
    }, style]}>
      {children}
    </View>
  );
}

export function Stack({
  children, gap = space.md, style,
}: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Spacer({ size = space.base }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.color.border }, style]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export function Screen({
  children, scroll = true, padded = true, style, contentStyle, refreshControl, edges,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  edges?: ReadonlyArray<"top" | "bottom" | "left" | "right">;
}) {
  const t = useTheme();
  const base: ViewStyle = { flex: 1, backgroundColor: t.color.bg };
  const pad: ViewStyle = padded
    ? { paddingHorizontal: space.base, paddingBottom: space.xxxl }
    : { paddingBottom: space.xxxl };

  if (!scroll) {
    return (
      <SafeAreaView style={[base, style]} edges={edges ?? ["top"]}>
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[base, style]} edges={edges ?? ["top"]}>
      <ScrollView
        contentContainerStyle={[pad, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CARD
// ─────────────────────────────────────────────────────────────────────────────
export function Card({
  children, style, level = 1, padded = true, onPress, tone = "default", entering,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  level?: 0 | 1 | 2 | 3 | 4;
  padded?: boolean;
  onPress?: () => void;
  tone?: "default" | "primary" | "sunken";
  entering?: any;
}) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = tone === "primary" ? t.color.primarySoft
    : tone === "sunken" ? t.color.bgSunken
    : t.color.bgElevated;

  const body: StyleProp<ViewStyle> = [
    {
      backgroundColor: bg,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tone === "primary" ? t.color.primary + "33" : t.color.border,
      padding: padded ? space.base : 0,
      overflow: "hidden",
    },
    level > 0 && elevation(level, t.color.shadow),
    style,
  ];

  if (!onPress) {
    return <Animated.View entering={entering} style={body}>{children}</Animated.View>;
  }
  return (
    <AnimatedPressable
      entering={entering}
      onPressIn={() => { scale.value = withSpring(0.975, motion.springSnappy); }}
      onPressOut={() => { scale.value = withSpring(1, motion.springSnappy); }}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={[body, aStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUTTON
// ─────────────────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type BtnSize = "sm" | "md" | "lg";

export function Button({
  label, onPress, variant = "primary", size = "md", icon, iconRight,
  loading, disabled, full, style, haptic = "light",
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: "light" | "medium" | "heavy" | "none";
}) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  const sizing = {
    sm: { h: 36, px: space.md, txt: "small" as const, ic: 15 },
    md: { h: 48, px: space.lg, txt: "bodyMd" as const, ic: 18 },
    lg: { h: 56, px: space.xl, txt: "h3" as const, ic: 20 },
  }[size];

  const skin = {
    primary:   { bg: t.color.primary,      fg: t.color.onPrimary, bd: "transparent" },
    secondary: { bg: t.color.bgSunken,     fg: t.color.text,      bd: t.color.border },
    ghost:     { bg: "transparent",        fg: t.color.primary,   bd: "transparent" },
    danger:    { bg: t.color.danger,       fg: "#FFFFFF",         bd: "transparent" },
    success:   { bg: t.color.success,      fg: "#FFFFFF",         bd: "transparent" },
  }[variant];

  const press = useCallback(() => {
    if (haptic !== "none") {
      const style = haptic === "heavy" ? Haptics.ImpactFeedbackStyle.Heavy
        : haptic === "medium" ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(style).catch(() => {});
    }
    onPress?.();
  }, [onPress, haptic]);

  return (
    <AnimatedPressable
      disabled={isDisabled}
      onPressIn={() => { if (!isDisabled) scale.value = withSpring(0.96, motion.springSnappy); }}
      onPressOut={() => { scale.value = withSpring(1, motion.springSnappy); }}
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={[
        {
          height: sizing.h,
          paddingHorizontal: sizing.px,
          borderRadius: radius.md,
          backgroundColor: skin.bg,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          borderColor: skin.bd,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          opacity: isDisabled ? 0.45 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        variant === "primary" && !isDisabled && elevation(2, t.color.shadow),
        aStyle,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={skin.fg} />
        : icon ? <Ionicons name={icon} size={sizing.ic} color={skin.fg} /> : null}
      <Text style={[typo[sizing.txt], { color: skin.fg, fontWeight: "700" }]} numberOfLines={1}>
        {label}
      </Text>
      {!loading && iconRight ? <Ionicons name={iconRight} size={sizing.ic} color={skin.fg} /> : null}
    </AnimatedPressable>
  );
}

export function IconButton({
  icon, onPress, size = 40, tone = "default", style, accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  tone?: "default" | "primary" | "danger" | "plain";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const skin = {
    default: { bg: t.color.bgSunken, fg: t.color.text },
    primary: { bg: t.color.primarySoft, fg: t.color.primary },
    danger:  { bg: t.color.dangerSoft, fg: t.color.danger },
    plain:   { bg: "transparent", fg: t.color.textMuted },
  }[tone];

  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withSpring(0.9, motion.springSnappy); }}
      onPressOut={() => { scale.value = withSpring(1, motion.springSnappy); }}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress?.(); }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? icon}
      style={[{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: skin.bg, alignItems: "center", justifyContent: "center",
      }, aStyle, style]}
    >
      <Ionicons name={icon} size={size * 0.48} color={skin.fg} />
    </AnimatedPressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BADGE / CHIP
// ─────────────────────────────────────────────────────────────────────────────
export function Badge({
  label, tone = "neutral", icon, size = "md", style,
}: {
  label: string;
  tone?: "neutral" | "primary" | "success" | "danger" | "warning" | "level";
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "sm" | "md";
  levelIndex?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const skin = {
    neutral: { bg: t.color.bgSunken,    fg: t.color.textMuted },
    primary: { bg: t.color.primarySoft, fg: t.color.primary },
    success: { bg: t.color.successSoft, fg: t.color.success },
    danger:  { bg: t.color.dangerSoft,  fg: t.color.danger },
    warning: { bg: t.color.warningSoft, fg: t.color.warning },
    level:   { bg: t.color.primarySoft, fg: t.color.primary },
  }[tone];
  const h = size === "sm" ? 20 : 26;

  return (
    <View style={[{
      height: h, paddingHorizontal: size === "sm" ? space.sm : space.md,
      borderRadius: radius.pill, backgroundColor: skin.bg,
      flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    }, style]}>
      {icon ? <Ionicons name={icon} size={size === "sm" ? 11 : 13} color={skin.fg} /> : null}
      <Text style={[size === "sm" ? typo.overline : typo.caption, { color: skin.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Proficiency pill coloured from the shared level ramp. */
export function LevelBadge({ level, size = "md" }: { level: number; size?: "sm" | "md" }) {
  const t = useTheme();
  const LABELS = ["Unskilled", "Beginner", "Practitioner", "Proficient", "Expert"];
  const i = Math.max(0, Math.min(4, Math.round(level)));
  const c = t.color.level[i];
  const h = size === "sm" ? 20 : 26;
  return (
    <View style={{
      height: h, paddingHorizontal: size === "sm" ? space.sm : space.md,
      borderRadius: radius.pill, backgroundColor: c + "22",
      borderWidth: StyleSheet.hairlineWidth, borderColor: c + "55",
      flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
      <Text style={[size === "sm" ? typo.overline : typo.caption, { color: t.dark ? t.color.text : c }]}>
        {LABELS[i]}
      </Text>
    </View>
  );
}

export function Chip({
  label, selected, onPress, icon,
}: {
  label: string; selected?: boolean; onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress?.(); }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        height: 36, paddingHorizontal: space.base, borderRadius: radius.pill,
        backgroundColor: selected ? t.color.primary : t.color.bgSunken,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? t.color.primary : t.color.border,
        flexDirection: "row", alignItems: "center", gap: 6,
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? t.color.onPrimary : t.color.textMuted} /> : null}
      <Text style={[typo.small, { color: selected ? t.color.onPrimary : t.color.text, fontWeight: "600" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROGRESS
// ─────────────────────────────────────────────────────────────────────────────
export function ProgressBar({
  value, height = 8, tone = "primary", track, style, animated = true,
}: {
  value: number;              // 0..1
  height?: number;
  tone?: "primary" | "success" | "warning" | "danger" | "accent";
  track?: string;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const w = useSharedValue(animated ? 0 : pct);

  React.useEffect(() => {
    w.value = withTiming(pct, { duration: animated ? motion.slow : 0 });
  }, [pct, animated]);

  const aStyle = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  const color = {
    primary: t.color.primary, success: t.color.success,
    warning: t.color.warning, danger: t.color.danger, accent: t.color.accent,
  }[tone];

  return (
    <View style={[{
      height, borderRadius: height / 2,
      backgroundColor: track ?? t.color.bgSunken, overflow: "hidden",
    }, style]}>
      <Animated.View style={[{ height: "100%", borderRadius: height / 2, backgroundColor: color }, aStyle]} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STAT TILE
// ─────────────────────────────────────────────────────────────────────────────
export function StatTile({
  label, value, sub, icon, tone = "primary", style, onPress, delay = 0, animate = true,
}: {
  label: string; value: string | number; sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  delay?: number;
  animate?: boolean;
}) {
  const t = useTheme();
  const c = {
    primary: t.color.primary, success: t.color.success, warning: t.color.warning,
    danger: t.color.danger, neutral: t.color.textMuted,
  }[tone];

  // Count up whenever the value is a plain number (or a plain numeric string).
  // A figure that animates to its value reads as measured rather than
  // hard-coded — worth it here, and nowhere that updates frequently.
  const numeric = typeof value === "number"
    ? value
    : /^[\d,]+$/.test(String(value)) ? Number(String(value).replace(/,/g, "")) : null;

  return (
    <Card level={1} style={[{ flex: 1, minWidth: 0 }, style]} onPress={onPress}>
      <Row justify="space-between" align="flex-start">
        <Text style={[typo.overline, { color: t.color.textSubtle, flex: 1 }]} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
        {icon ? (
          <View style={{
            width: 26, height: 26, borderRadius: 13,
            backgroundColor: c + "1A", alignItems: "center", justifyContent: "center",
          }}>
            <Ionicons name={icon} size={14} color={c} />
          </View>
        ) : null}
      </Row>

      <View style={{ marginTop: space.sm }}>
        {animate && numeric !== null ? (
          <CountUp value={numeric} variant="h1" delay={delay} duration={900} />
        ) : (
          <Text style={[typo.h1, { color: t.color.text }]} numberOfLines={1}>{value}</Text>
        )}
      </View>

      {sub ? (
        <Text style={[typo.caption, { color: t.color.textSubtle, marginTop: 2 }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMPTY / LOADING
// ─────────────────────────────────────────────────────────────────────────────
export function EmptyState({
  icon = "sparkles-outline", title, body, actionLabel, onAction, compact,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string; body?: string;
  actionLabel?: string; onAction?: () => void;
  compact?: boolean;
}) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(motion.base)} style={{
      alignItems: "center", paddingVertical: compact ? space.xl : space.huge,
      paddingHorizontal: space.lg, gap: space.md,
    }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: t.color.primarySoft, alignItems: "center", justifyContent: "center",
      }}>
        <Ionicons name={icon} size={28} color={t.color.primary} />
      </View>
      <Txt variant="h3" center>{title}</Txt>
      {body ? <Txt variant="body" tone="muted" center style={{ maxWidth: 320 }}>{body}</Txt> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: space.sm }} />
      ) : null}
    </Animated.View>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: space.huge, alignItems: "center", gap: space.md }}>
      <ActivityIndicator size="large" color={t.color.primary} />
      {label ? <Txt variant="small" tone="muted">{label}</Txt> : null}
    </View>
  );
}

export function Skeleton({
  height = 16, width = "100%", radius: r = radius.sm, style,
}: { height?: number; width?: any; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const o = useSharedValue(0.4);
  React.useEffect(() => {
    o.value = withTiming(0.85, { duration: 800 });
    const id = setInterval(() => {
      o.value = withTiming(o.value > 0.6 ? 0.4 : 0.85, { duration: 800 });
    }, 800);
    return () => clearInterval(id);
  }, []);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: t.color.bgSunken }, a, style]} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION HEADER
// ─────────────────────────────────────────────────────────────────────────────
export function SectionHeader({
  title, action, onAction, icon,
}: {
  title: string; action?: string; onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const t = useTheme();
  return (
    <Row justify="space-between" style={{ marginBottom: space.md, marginTop: space.lg }}>
      <Row gap={space.sm}>
        {icon ? <Ionicons name={icon} size={17} color={t.color.textMuted} /> : null}
        <Txt variant="h3">{title}</Txt>
      </Row>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Row gap={2}>
            <Text style={[typo.small, { color: t.color.primary, fontWeight: "700" }]}>{action}</Text>
            <Ionicons name="chevron-forward" size={14} color={t.color.primary} />
          </Row>
        </Pressable>
      ) : null}
    </Row>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  INVERSE SURFACE
//  Monochrome's equivalent of a brand panel: flip the ground. Black on white,
//  white on black. Carries far more weight than a gradient ever did, and it
//  never fights the content sitting on it.
// ─────────────────────────────────────────────────────────────────────────────
export function InverseSurface({
  children, style, radiusSize = radius.xl,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; radiusSize?: number }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.color.bgInverse,
          borderRadius: radiusSize,
          padding: space.lg,
          overflow: "hidden",
        },
        elevation(3, t.color.shadow),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Text colour that sits on an InverseSurface. */
export function useOnInverse() {
  const t = useTheme();
  return {
    strong: t.color.textInverse,
    muted: t.dark ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.68)",
    subtle: t.dark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.48)",
    fill: t.dark ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.14)",
    fillStrong: t.dark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.22)",
    hairline: t.dark ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.20)",
  };
}

export { Animated, FadeIn, FadeInDown, Ionicons, useSafeAreaInsets, Platform };
