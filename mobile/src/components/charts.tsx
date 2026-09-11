/**
 * SVG data visualisation.
 *
 * Hand-built rather than pulled from a chart library: these are a small number
 * of purpose-specific views, and controlling the geometry directly is what
 * lets them stay legible on a 360dp phone screen where a generic chart
 * component would crowd.
 */
import React, { useMemo } from "react";
import { View, Pressable } from "react-native";
import Svg, {
  Circle, Path, Polygon, Line, G, Text as SvgText, Rect, Defs,
  LinearGradient as SvgGradient, Stop,
} from "react-native-svg";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTheme, space, radius, type as typo } from "../theme";
import { Txt, Row, Card } from "./ui";

// ─────────────────────────────────────────────────────────────────────────────
//  COMPETENCY RADAR — measured proficiency against the role's required bar
// ─────────────────────────────────────────────────────────────────────────────
export interface RadarAxis {
  label: string;
  short: string;
  current: number;   // 0..4
  required: number;  // 0..4
}

export function CompetencyRadar({
  axes, size = 280, maxValue = 4,
}: { axes: RadarAxis[]; size?: number; maxValue?: number }) {
  const t = useTheme();
  const n = axes.length;

  const geometry = useMemo(() => {
    if (n < 3) return null;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 46;                 // room for labels

    const point = (i: number, value: number) => {
      // Start at 12 o'clock and go clockwise
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const ratio = Math.max(0, Math.min(1, value / maxValue));
      return { x: cx + Math.cos(angle) * r * ratio, y: cy + Math.sin(angle) * r * ratio };
    };

    const toPoly = (vals: number[]) =>
      vals.map((v, i) => { const p = point(i, v); return `${p.x},${p.y}`; }).join(" ");

    return {
      cx, cy, r, point,
      currentPoly: toPoly(axes.map((a) => a.current)),
      requiredPoly: toPoly(axes.map((a) => a.required)),
      rings: [1, 2, 3, 4].map((lvl) => toPoly(axes.map(() => lvl))),
      spokes: axes.map((_, i) => point(i, maxValue)),
      labels: axes.map((a, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lr = r + 16;
        const cos = Math.cos(angle);
        const anchor: "middle" | "start" | "end" =
          Math.abs(cos) < 0.3 ? "middle" : (cos > 0 ? "start" : "end");
        // Clamp inside the viewport so long labels can't clip at the edge.
        // Width estimate at 9.5px: ~5.4px per character.
        const halfWidth = (a.short.length * 5.4) / 2;
        const pad = 2;
        const rawX = cx + cos * lr;
        const minX = anchor === "start" ? pad : anchor === "middle" ? pad + halfWidth : pad + halfWidth * 2;
        const maxX = anchor === "start" ? size - pad - halfWidth * 2
                   : anchor === "middle" ? size - pad - halfWidth
                   : size - pad;
        const x = Math.max(minX, Math.min(maxX, rawX));
        return {
          x,
          y: cy + Math.sin(angle) * lr + 4,
          anchor,
          text: a.short,
        };
      }),
    };
  }, [axes, size, n, maxValue]);

  if (!geometry) {
    return (
      <View style={{ height: size, alignItems: "center", justifyContent: "center" }}>
        <Txt variant="small" tone="muted">Need at least 3 competencies to plot a radar.</Txt>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.color.primary} stopOpacity="0.45" />
            <Stop offset="1" stopColor={t.color.accent} stopOpacity="0.20" />
          </SvgGradient>
        </Defs>

        {/* concentric rings */}
        {geometry.rings.map((poly, i) => (
          <Polygon
            key={`ring-${i}`}
            points={poly}
            fill="none"
            stroke={t.color.border}
            strokeWidth={i === geometry.rings.length - 1 ? 1.2 : 0.7}
          />
        ))}

        {/* spokes */}
        {geometry.spokes.map((p, i) => (
          <Line key={`spoke-${i}`} x1={geometry.cx} y1={geometry.cy} x2={p.x} y2={p.y}
                stroke={t.color.border} strokeWidth={0.7} />
        ))}

        {/* required bar — dashed outline, the target to reach */}
        <Polygon
          points={geometry.requiredPoly}
          fill="none"
          stroke={t.color.textSubtle}
          strokeWidth={1.6}
          strokeDasharray="5,4"
        />

        {/* measured proficiency — filled */}
        <Polygon
          points={geometry.currentPoly}
          fill="url(#radarFill)"
          stroke={t.color.primary}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />

        {/* vertices */}
        {axes.map((a, i) => {
          const p = geometry.point(i, a.current);
          return <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3.4}
                         fill={t.color.primary} stroke={t.color.bgElevated} strokeWidth={1.6} />;
        })}

        {/* axis labels */}
        {geometry.labels.map((l, i) => (
          <SvgText key={`lb-${i}`} x={l.x} y={l.y} fontSize="9.5" fontWeight="700"
                   fill={t.color.textMuted} textAnchor={l.anchor}>
            {l.text}
          </SvgText>
        ))}
      </Svg>

      <Row gap={space.base} style={{ marginTop: space.sm }}>
        <Row gap={6}>
          <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: t.color.primary }} />
          <Txt variant="caption" tone="muted">Your level</Txt>
        </Row>
        <Row gap={6}>
          <View style={{
            width: 12, height: 0, borderRadius: 2,
            borderTopWidth: 2, borderStyle: "dashed", borderColor: t.color.textSubtle,
          }} />
          <Txt variant="caption" tone="muted">Required for role</Txt>
        </Row>
      </Row>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROGRESS RING
// ─────────────────────────────────────────────────────────────────────────────
export function ProgressRing({
  value, size = 120, stroke = 10, label, sublabel, tone,
}: {
  value: number; size?: number; stroke?: number;
  label?: string; sublabel?: string; tone?: string;
}) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone ?? t.color.primary;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {/* Standard SVG transform rather than <G rotation origin>: the
            origin prop is native-only and throws on react-native-svg web. */}
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={t.color.bgSunken} strokeWidth={stroke} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={color} strokeWidth={stroke} fill="none"
                  strokeDasharray={`${c}`} strokeDashoffset={c * (1 - pct)}
                  strokeLinecap="round" />
        </G>
      </Svg>
      <View style={{ alignItems: "center" }}>
        {label ? <Txt variant="h2">{label}</Txt> : null}
        {sublabel ? <Txt variant="caption" tone="subtle">{sublabel}</Txt> : null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STREAK HEATMAP — 12 weeks of study activity
// ─────────────────────────────────────────────────────────────────────────────
export function StreakHeatmap({
  data, weeks = 12, onDayPress,
}: {
  data: Record<string, number>;   // 'YYYY-MM-DD' -> minutes
  weeks?: number;
  onDayPress?: (date: string, minutes: number) => void;
}) {
  const t = useTheme();
  const cell = 13;
  const gap = 3;

  const grid = useMemo(() => {
    const today = new Date();
    const days: { date: string; minutes: number; dow: number }[] = [];
    const total = weeks * 7;
    // Align so the last column ends on today
    const start = new Date(today);
    start.setDate(start.getDate() - (total - 1));
    for (let i = 0; i < total; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, minutes: data[key] ?? 0, dow: d.getDay() });
    }
    return days;
  }, [data, weeks]);

  const max = Math.max(30, ...Object.values(data));
  const shade = (m: number) => {
    if (m <= 0) return t.color.bgSunken;
    const intensity = Math.min(1, m / max);
    // Purple ramp — opacity encodes effort
    const alpha = 0.25 + intensity * 0.75;
    return t.color.primary + Math.round(alpha * 255).toString(16).padStart(2, "0");
  };

  const width = weeks * (cell + gap);

  return (
    <View>
      <Svg width={width} height={7 * (cell + gap)}>
        {grid.map((d, i) => {
          const col = Math.floor(i / 7);
          const row = i % 7;
          return (
            <Rect
              key={d.date}
              x={col * (cell + gap)}
              y={row * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={shade(d.minutes)}
              stroke={d.minutes > 0 ? "transparent" : t.color.border}
              strokeWidth={0.5}
              onPress={onDayPress ? () => onDayPress(d.date, d.minutes) : undefined}
            />
          );
        })}
      </Svg>
      <Row justify="space-between" style={{ marginTop: space.sm, width }}>
        <Txt variant="overline" tone="subtle">{weeks} WEEKS AGO</Txt>
        <Txt variant="overline" tone="subtle">TODAY</Txt>
      </Row>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPARKLINE
// ─────────────────────────────────────────────────────────────────────────────
export function Sparkline({
  values, width = 120, height = 36, tone,
}: { values: number[]; width?: number; height?: number; tone?: string }) {
  const t = useTheme();
  const color = tone ?? t.color.primary;

  if (values.length < 2) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return { x, y };
  });

  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1].x},${height} L${pts[0].x},${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.28" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGradient>
      </Defs>
      <Path d={area} fill="url(#sparkFill)" />
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={color} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  GAP BAR — one competency: current fill against a required marker
// ─────────────────────────────────────────────────────────────────────────────
export function GapBar({
  current, required, height = 10, showMarker = true,
}: { current: number; required: number; height?: number; showMarker?: boolean }) {
  const t = useTheme();
  const cur = Math.max(0, Math.min(4, current)) / 4;
  const req = Math.max(0, Math.min(4, required)) / 4;
  const met = current >= required;

  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.color.bgSunken, overflow: "visible" }}>
      <View style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${cur * 100}%`,
        borderRadius: height / 2,
        backgroundColor: met ? t.color.success : t.color.primary,
      }} />
      {showMarker ? (
        <View style={{
          position: "absolute",
          left: `${req * 100}%`,
          top: -3, bottom: -3,
          width: 2.5,
          borderRadius: 2,
          backgroundColor: t.color.text,
          transform: [{ translateX: -1.25 }],
        }} />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BLOOM DISTRIBUTION — shows a quiz isn't all rote recall
// ─────────────────────────────────────────────────────────────────────────────
const BLOOM_ORDER = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;

export function BloomBars({ counts }: { counts: Record<string, number> }) {
  const t = useTheme();
  const max = Math.max(1, ...BLOOM_ORDER.map((b) => counts[b] ?? 0));

  return (
    <View style={{ gap: space.sm }}>
      {BLOOM_ORDER.map((b, i) => {
        const v = counts[b] ?? 0;
        if (v === 0 && i > 3) return null;
        const shade = t.color.level[Math.min(4, Math.floor(i * 0.8))];
        return (
          <Row key={b} gap={space.sm}>
            <Txt variant="caption" tone="muted" style={{ width: 74 }} numberOfLines={1}>
              {b.charAt(0).toUpperCase() + b.slice(1)}
            </Txt>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: t.color.bgSunken }}>
              <View style={{
                width: `${(v / max) * 100}%`, height: "100%",
                borderRadius: 4, backgroundColor: shade,
              }} />
            </View>
            <Txt variant="caption" tone="subtle" style={{ width: 20, textAlign: "right" }}>{v}</Txt>
          </Row>
        );
      })}
    </View>
  );
}
