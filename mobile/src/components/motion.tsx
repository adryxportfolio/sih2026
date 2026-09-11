/**
 * Motion kit.
 *
 * A note on the stack: GSAP and Framer Motion are DOM libraries and do not
 * run in React Native. The equivalent here is Reanimated, which is strictly
 * better for this use case — animations are compiled to worklets and run on
 * the UI thread, so they hold 60/120fps even while the JS thread is busy
 * parsing an AI response. Moti sits on top of it to give a declarative,
 * Framer-Motion-shaped API.
 *
 * Everything below is built from a small set of shared spring presets, so
 * motion feels like one system rather than a pile of individual effects.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue,
  withSpring, withTiming, withRepeat, withSequence, withDelay,
  interpolate, interpolateColor, Extrapolation, Easing,
  runOnJS, cancelAnimation, useAnimatedProps, type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Path, G } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useTheme, space, radius, type as typo, elevation } from "../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// ─────────────────────────────────────────────────────────────────────────────
//  SPRING PRESETS — the whole app's motion vocabulary
// ─────────────────────────────────────────────────────────────────────────────
export const SPRING = {
  /** Buttons, chips — responds instantly, settles fast. */
  snappy: { damping: 20, stiffness: 300, mass: 0.7 },
  /** Cards, sheets — has a little weight. */
  smooth: { damping: 18, stiffness: 170, mass: 0.9 },
  /** Celebrations — visible overshoot. Use sparingly. */
  bouncy: { damping: 10, stiffness: 190, mass: 0.8 },
  /** Large surfaces — slow and deliberate. */
  gentle: { damping: 22, stiffness: 90,  mass: 1.1 },
} as const;

export const TIMING = {
  instant: 120,
  fast: 200,
  base: 320,
  slow: 520,
  deliberate: 800,
} as const;

/** Standard ease for non-spring motion. Matches Material's emphasised curve. */
export const EASE = Easing.bezier(0.2, 0, 0, 1);

// ─────────────────────────────────────────────────────────────────────────────
//  PRESSABLE WITH PHYSICS
//  Every tappable surface in the app gets the same press feel.
// ─────────────────────────────────────────────────────────────────────────────
export function Squish({
  children, onPress, onLongPress, scaleTo = 0.955, disabled,
  haptic = "light", style, hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  scaleTo?: number;
  disabled?: boolean;
  haptic?: "none" | "light" | "medium" | "heavy" | "select";
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const fire = useCallback(() => {
    if (haptic === "none") return;
    if (haptic === "select") { Haptics.selectionAsync().catch(() => {}); return; }
    const s = haptic === "heavy" ? Haptics.ImpactFeedbackStyle.Heavy
      : haptic === "medium" ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(s).catch(() => {});
  }, [haptic]);

  return (
    <AnimatedPressable
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => { scale.value = withSpring(scaleTo, SPRING.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, SPRING.snappy); }}
      onPress={() => { fire(); onPress?.(); }}
      onLongPress={onLongPress}
      style={[style, aStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STAGGERED ENTRANCE
//  Children arrive in sequence rather than all at once, which reads as the
//  list being composed rather than dumped.
// ─────────────────────────────────────────────────────────────────────────────
export function Stagger({
  children, delay = 0, step = 55, from = "bottom", distance = 18,
}: {
  children: React.ReactNode;
  delay?: number;
  step?: number;
  from?: "bottom" | "top" | "left" | "right" | "scale";
  distance?: number;
}) {
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, i) => (
        <Appear key={i} delay={delay + i * step} from={from} distance={distance}>
          {child}
        </Appear>
      ))}
    </>
  );
}

export function Appear({
  children, delay = 0, from = "bottom", distance = 18, duration = TIMING.base, style,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: "bottom" | "top" | "left" | "right" | "scale" | "fade";
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: EASE }));
    return () => cancelAnimation(progress);
  }, [delay, duration]);

  const aStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const offset = interpolate(p, [0, 1], [distance, 0], Extrapolation.CLAMP);
    const base: any = { opacity: p };
    switch (from) {
      case "bottom": base.transform = [{ translateY: offset }]; break;
      case "top":    base.transform = [{ translateY: -offset }]; break;
      case "left":   base.transform = [{ translateX: -offset }]; break;
      case "right":  base.transform = [{ translateX: offset }]; break;
      case "scale":  base.transform = [{ scale: interpolate(p, [0, 1], [0.94, 1]) }]; break;
      default: break;
    }
    return base;
  });

  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  COUNT-UP NUMBER
//  A figure that animates to its value reads as measured rather than
//  hard-coded — worth it on the headline stats, nowhere else.
// ─────────────────────────────────────────────────────────────────────────────
export function CountUp({
  value, duration = TIMING.deliberate, delay = 0,
  decimals = 0, prefix = "", suffix = "",
  style, variant = "h1",
}: {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: any;
  variant?: keyof typeof typo;
}) {
  const t = useTheme();
  const [display, setDisplay] = useState("0");
  const progress = useSharedValue(0);

  const update = useCallback((p: number) => {
    const v = p * value;
    setDisplay(
      decimals > 0
        ? v.toFixed(decimals)
        : Math.round(v).toLocaleString("en-IN"),
    );
  }, [value, decimals]);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration, easing: EASE }));
  }, [value, delay, duration]);

  useDerivedValue(() => {
    runOnJS(update)(progress.value);
  }, [progress, update]);

  return (
    <Text style={[typo[variant], { color: t.color.text }, style]}>
      {prefix}{display}{suffix}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATED PROGRESS RING — sweeps to value on mount
// ─────────────────────────────────────────────────────────────────────────────
export function AnimatedRing({
  value, size = 120, stroke = 10, delay = 0, color, trackColor, children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  delay?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(Math.max(0, Math.min(1, value)), {
      duration: TIMING.deliberate, easing: EASE,
    }));
  }, [value, delay]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={trackColor ?? t.color.bgSunken}
            strokeWidth={stroke} fill="none"
          />
          <AnimatedCircle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color ?? t.color.primary}
            strokeWidth={stroke} fill="none"
            strokeDasharray={`${circumference}`}
            strokeLinecap="round"
            animatedProps={animatedProps}
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATED BAR — grows from zero
// ─────────────────────────────────────────────────────────────────────────────
export function GrowBar({
  value, height = 8, delay = 0, color, trackColor, marker, style,
}: {
  value: number;
  height?: number;
  delay?: number;
  color?: string;
  trackColor?: string;
  /** 0..1 position of a target marker line. */
  marker?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(Math.max(0, Math.min(1, value)), SPRING.gentle));
  }, [value, delay]);

  const aStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={[{
      height, borderRadius: height / 2,
      backgroundColor: trackColor ?? t.color.bgSunken,
      overflow: marker != null ? "visible" : "hidden",
    }, style]}>
      <Animated.View style={[{
        height: "100%", borderRadius: height / 2,
        backgroundColor: color ?? t.color.primary,
      }, aStyle]} />
      {marker != null ? (
        <View style={{
          position: "absolute", left: `${marker * 100}%`,
          top: -3, bottom: -3, width: 2.5, borderRadius: 2,
          backgroundColor: t.color.text,
          transform: [{ translateX: -1.25 }],
        }} />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PULSE — draws the eye to something new without a colour change
// ─────────────────────────────────────────────────────────────────────────────
export function Pulse({
  children, active = true, scaleTo = 1.04, period = 1600,
}: { children: React.ReactNode; active?: boolean; scaleTo?: number; period?: number }) {
  const s = useSharedValue(1);

  useEffect(() => {
    if (!active) { s.value = withSpring(1, SPRING.smooth); return; }
    s.value = withRepeat(
      withSequence(
        withTiming(scaleTo, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1, false,
    );
    return () => cancelAnimation(s);
  }, [active, scaleTo, period]);

  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHAKE — wrong answer feedback. Short, sharp, then done.
// ─────────────────────────────────────────────────────────────────────────────
export function useShake() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const shake = useCallback(() => {
    x.value = withSequence(
      withTiming(-9, { duration: 55 }),
      withTiming(8,  { duration: 55 }),
      withTiming(-5, { duration: 55 }),
      withTiming(3,  { duration: 55 }),
      withTiming(0,  { duration: 55 }),
    );
  }, []);
  return { style, shake };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONFETTI — monochrome. Celebration by motion and density, not colour.
// ─────────────────────────────────────────────────────────────────────────────
interface Piece { x: number; delay: number; drift: number; rot: number; size: number; round: boolean; }

export function Confetti({
  count = 44, active, width, duration = 2400, onDone,
}: { count?: number; active: boolean; width: number; duration?: number; onDone?: () => void }) {
  const t = useTheme();
  const pieces = useRef<Piece[]>(
    Array.from({ length: count }, (_, i) => ({
      x: Math.random() * width,
      delay: Math.random() * 500,
      drift: (Math.random() - 0.5) * 140,
      rot: (Math.random() - 0.5) * 900,
      size: 5 + Math.random() * 7,
      round: Math.random() > 0.55,
    })),
  ).current;

  if (!active) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <ConfettiPiece
          key={i} piece={p} duration={duration}
          color={i % 3 === 0 ? t.color.textMuted : t.color.text}
          onDone={i === 0 ? onDone : undefined}
        />
      ))}
    </View>
  );
}

function ConfettiPiece({
  piece, duration, color, onDone,
}: { piece: Piece; duration: number; color: string; onDone?: () => void }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(piece.delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) },
      (finished) => { if (finished && onDone) runOnJS(onDone)(); }));
    return () => cancelAnimation(p);
  }, []);

  const a = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(p.value, [0, 1], [-40, 720]) },
      { translateX: interpolate(p.value, [0, 1], [0, piece.drift]) },
      { rotate: `${interpolate(p.value, [0, 1], [0, piece.rot])}deg` },
    ],
  }));

  return (
    <Animated.View style={[{
      position: "absolute", left: piece.x, top: 0,
      width: piece.size, height: piece.round ? piece.size : piece.size * 2.2,
      borderRadius: piece.round ? piece.size / 2 : 1.5,
      backgroundColor: color,
    }, a]} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  FLIP CARD — 3D flip for flashcards.
//  Rotating the card rather than cross-fading matters here: the gesture
//  mirrors turning over a physical card, which is the mental model learners
//  already have for recall practice.
// ─────────────────────────────────────────────────────────────────────────────
export function FlipCard({
  front, back, flipped, onFlip, style,
}: {
  front: React.ReactNode;
  back: React.ReactNode;
  flipped: boolean;
  onFlip?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const p = useSharedValue(flipped ? 1 : 0);

  useEffect(() => {
    p.value = withSpring(flipped ? 1 : 0, { damping: 16, stiffness: 120, mass: 0.9 });
  }, [flipped]);

  // Whichever face is resting stays IN FLOW so the container takes its height;
  // the other is absolute. Without this the container is always sized to the
  // front, and a taller answer silently overlaps whatever follows it.
  const restingIsBack = flipped;

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(p.value, [0, 1], [0, 180])}deg` },
    ],
    opacity: p.value < 0.5 ? 1 : 0,
    backfaceVisibility: "hidden",
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(p.value, [0, 1], [180, 360])}deg` },
    ],
    opacity: p.value >= 0.5 ? 1 : 0,
    backfaceVisibility: "hidden",
  }));

  const absolute: ViewStyle = { position: "absolute", left: 0, right: 0, top: 0 };

  return (
    <Pressable onPress={onFlip} style={style}>
      <Animated.View
        pointerEvents={restingIsBack ? "none" : "auto"}
        style={[frontStyle, restingIsBack ? absolute : null]}
      >
        {front}
      </Animated.View>
      <Animated.View
        pointerEvents={restingIsBack ? "auto" : "none"}
        style={[backStyle, restingIsBack ? null : absolute]}
      >
        {back}
      </Animated.View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHIMMER SKELETON
// ─────────────────────────────────────────────────────────────────────────────
export function Shimmer({
  width = "100%", height = 16, radius: r = radius.sm, style,
}: { width?: any; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(p);
  }, []);

  const a = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.35, 0.85]),
  }));

  return (
    <Animated.View style={[{
      width, height, borderRadius: r, backgroundColor: t.color.bgSunken,
    }, a, style]} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SLIDE-IN TOAST
// ─────────────────────────────────────────────────────────────────────────────
export function Toast({
  visible, title, body, icon, onHide, duration = 3200,
}: {
  visible: boolean;
  title: string;
  body?: string;
  icon?: React.ReactNode;
  onHide?: () => void;
  duration?: number;
}) {
  const t = useTheme();
  const p = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      p.value = withSpring(1, SPRING.smooth);
      const id = setTimeout(() => {
        p.value = withTiming(0, { duration: TIMING.fast }, (f) => {
          if (f && onHide) runOnJS(onHide)();
        });
      }, duration);
      return () => clearTimeout(id);
    }
    p.value = withTiming(0, { duration: TIMING.fast });
  }, [visible, duration]);

  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: interpolate(p.value, [0, 1], [-70, 0]) }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: "absolute", top: 54, left: space.base, right: space.base,
        backgroundColor: t.color.bgInverse,
        borderRadius: radius.lg, padding: space.base,
        flexDirection: "row", alignItems: "center", gap: space.md,
        zIndex: 999,
        ...elevation(4, t.color.shadow),
      }, a]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[typo.bodyMd, { color: t.color.textInverse }]}>{title}</Text>
        {body ? (
          <Text style={[typo.caption, { color: t.dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.7)", marginTop: 2 }]}>
            {body}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export { Animated, useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate };
