/**
 * Floating mascot.
 *
 * A persistent, tappable assistant that sits above the tab bar on every
 * screen. Tapping it opens a short menu — ask Samiksha AI a question, or go to
 * the agent workspace — because "help me understand" and "do this for me" are
 * different requests and the officer should not have to guess which one the
 * mascot means.
 *
 * Rendering note: the source clip has a solid black background and no alpha
 * channel. Rather than fight that with chroma keying, the mascot sits inside
 * a black disc — so the video's own background becomes the button, seamlessly,
 * in both light and dark themes. That is also exactly why a monochrome palette
 * suits this asset: a blue robot on black would clash with a coloured brand,
 * but against black-and-white it reads as intentional.
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence,
  withTiming, withSpring, withDelay, Easing, FadeIn, FadeOut,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius, type as typo, elevation, motion } from "../theme";

const MASCOT = require("../../assets/mascot/mascot-small.gif");

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface MascotTip {
  text: string;
  cta?: string;
  /** Question to open Samiksha AI with when the call-to-action is tapped. */
  prompt?: string;
}

export interface MascotMenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}

export function FloatingMascot({
  onPress,
  menu,
  tip,
  bottom = 78,
  right = 16,
  size = 62,
  hidden,
}: {
  /** Tip call-to-action, and the tap handler when there is no menu. */
  onPress?: () => void;
  /** Choices shown when the mascot itself is tapped. */
  menu?: MascotMenuItem[];
  tip?: MascotTip | null;
  bottom?: number;
  right?: number;
  size?: number;
  hidden?: boolean;
}) {
  const t = useTheme();
  const [showTip, setShowTip] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const bob = useSharedValue(0);
  const scale = useSharedValue(1);
  const ring = useSharedValue(0);

  // Idle bob — small enough to read as "alive" rather than "distracting".
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, []);

  // Attention pulse only when there's something to say
  useEffect(() => {
    if (tip) {
      ring.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      );
      // Show, then get out of the way. A tip that sits on top of content
      // stops being help and starts being an obstruction.
      const show = setTimeout(() => setShowTip(true), 1200);
      const hide = setTimeout(() => setShowTip(false), 9000);
      return () => { clearTimeout(show); clearTimeout(hide); };
    }
    ring.value = 0;
    setShowTip(false);
  }, [tip]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }, { scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.35,
    transform: [{ scale: 1 + ring.value * 0.45 }],
  }));

  const press = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowTip(false);
    onPress?.();
  }, [onPress]);

  const tapMascot = useCallback(() => {
    if (!menu?.length) { press(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowTip(false);
    setMenuOpen((open) => !open);
  }, [menu, press]);

  if (hidden) return null;

  return (
    <>
    {menuOpen ? (
      <Pressable
        accessibilityLabel="Close menu"
        onPress={() => setMenuOpen(false)}
        style={[StyleSheet.absoluteFill, { backgroundColor: t.color.bgOverlay }]}
      />
    ) : null}
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", right, bottom, alignItems: "flex-end" }}
    >
      {/* Menu */}
      {menuOpen && menu?.length ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          style={{
            width: 264,
            marginBottom: space.sm,
            backgroundColor: t.color.bgElevated,
            borderRadius: radius.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.color.borderStrong,
            overflow: "hidden",
            ...elevation(4, t.color.shadow),
          }}
        >
          {menu.map((item, i) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setMenuOpen(false);
                item.onPress();
              }}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: space.md,
                paddingVertical: space.md, paddingHorizontal: space.base,
                backgroundColor: pressed ? t.color.bgSunken : "transparent",
                borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: t.color.border,
              })}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: i === 0 ? t.color.primary : t.color.bgSunken,
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons name={item.icon} size={17} color={i === 0 ? t.color.onPrimary : t.color.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typo.bodyMd, color: t.color.text }}>{item.label}</Text>
                {item.hint ? (
                  <Text style={{ ...typo.caption, color: t.color.textMuted, marginTop: 1 }}>{item.hint}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={15} color={t.color.textSubtle} />
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      {/* Speech bubble */}
      {showTip && tip ? (
        <Animated.View
          entering={FadeIn.duration(260)}
          exiting={FadeOut.duration(180)}
          style={{
            maxWidth: 248,
            marginBottom: space.sm,
            marginRight: 4,
            backgroundColor: t.color.bgElevated,
            borderRadius: radius.lg,
            borderBottomRightRadius: radius.xs,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.color.borderStrong,
            paddingVertical: space.md,
            paddingHorizontal: space.base,
            ...elevation(3, t.color.shadow),
          }}
        >
          <Pressable onPress={() => setShowTip(false)} hitSlop={6}
                     style={{ position: "absolute", top: 6, right: 8, zIndex: 2 }}>
            <Ionicons name="close" size={13} color={t.color.textSubtle} />
          </Pressable>
          <Text style={{ ...typo.small, color: t.color.text, paddingRight: 14 }}>
            {tip.text}
          </Text>
          {tip.cta ? (
            <Pressable onPress={press} style={{ marginTop: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ ...typo.caption, color: t.color.text, textDecorationLine: "underline" }}>
                  {tip.cta}
                </Text>
                <Ionicons name="arrow-forward" size={11} color={t.color.text} />
              </View>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}

      {/* Mascot */}
      <View style={{ width: size, height: size }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: size, height: size, borderRadius: size / 2,
              borderWidth: 2, borderColor: t.color.text,
            },
            ringStyle,
          ]}
        />
        <AnimatedPressable
          onPress={tapMascot}
          onPressIn={() => { scale.value = withSpring(0.9, motion.springSnappy); }}
          onPressOut={() => { scale.value = withSpring(1, motion.springSnappy); }}
          accessibilityRole="button"
          accessibilityLabel={menu?.length ? "Open Samiksha AI menu" : "Open AI tutor"}
          accessibilityState={{ expanded: menuOpen }}
          style={[
            {
              width: size, height: size, borderRadius: size / 2,
              backgroundColor: "#000000",
              borderWidth: 1.5,
              borderColor: t.dark ? t.color.border : t.color.text,
              overflow: "hidden",
              alignItems: "center", justifyContent: "center",
              ...elevation(4, t.color.shadow),
            },
            bodyStyle,
          ]}
        >
          <Image
            source={MASCOT}
            style={{ width: size * 1.04, height: size * 1.04 }}
            contentFit="cover"
            // expo-image plays animated GIF/WebP natively on native and web
            autoplay
            cachePolicy="memory-disk"
            transition={220}
          />
        </AnimatedPressable>
      </View>
    </View>
    </>
  );
}
