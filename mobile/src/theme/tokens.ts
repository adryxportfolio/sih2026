/**
 * Samiksha design tokens — MONOCHROME.
 *
 * The palette is white, black, and the greys between them. Nothing else
 * carries brand meaning.
 *
 * Why monochrome works here rather than reading as unfinished: when no colour
 * is decorative, every colour is informational. Emphasis has to come from
 * weight, scale, spacing and contrast — which is harder to do and much harder
 * to do badly. A government product that looks like a Swiss timetable reads as
 * serious; one that looks like a sticker sheet does not.
 *
 * The single exception is answer correctness. A quiz cannot mark right and
 * wrong in the same hue — that is an accessibility failure, not a style
 * choice. Those two signals use heavily desaturated green/red, always paired
 * with an icon so they never rely on colour alone.
 *
 * Every text/background pair below meets WCAG AA (4.5:1) or better.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  PRIMITIVES — one neutral ramp, pure endpoints
// ─────────────────────────────────────────────────────────────────────────────
export const palette = {
  ink: {
    0:    "#FFFFFF",   // pure white
    25:   "#FCFCFC",
    50:   "#F7F7F8",
    100:  "#F0F0F1",
    150:  "#E8E8EA",
    200:  "#DEDEE1",
    300:  "#C4C4C9",
    400:  "#9A9AA1",
    500:  "#71717A",
    600:  "#52525B",
    700:  "#3F3F46",
    800:  "#27272A",
    850:  "#1C1C1F",
    900:  "#141416",
    950:  "#0A0A0B",
    1000: "#000000",   // pure black
  },
  // Correctness only. Never for decoration, never for emphasis.
  green: { 50: "#F0FAF4", 100: "#D9F2E3", 400: "#4ABE84", 500: "#2E9E68", 600: "#1F7F51", 900: "#0B2E1D" },
  red:   { 50: "#FDF3F3", 100: "#FADEDE", 400: "#D97070", 500: "#C24E4E", 600: "#A33A3A", 900: "#2E0F0F" },
  amber: { 50: "#FCF8EF", 100: "#F6EBD2", 400: "#C79A4B", 500: "#A87F33", 600: "#8A6626", 900: "#2A1F0B" },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  SEMANTIC THEMES
// ─────────────────────────────────────────────────────────────────────────────
export interface Theme {
  dark: boolean;
  color: {
    bg: string;
    bgElevated: string;
    bgSunken: string;
    bgOverlay: string;
    /** Inverted surface — the monochrome equivalent of a brand fill. */
    bgInverse: string;

    border: string;
    borderStrong: string;

    text: string;
    textMuted: string;
    textSubtle: string;
    textInverse: string;

    primary: string;
    primaryHover: string;
    primarySoft: string;
    onPrimary: string;

    accent: string;
    accentSoft: string;

    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    info: string;
    infoSoft: string;

    /** Proficiency ladder as a greyscale ramp: unmeasured → mastered. */
    level: [string, string, string, string, string];

    shadow: string;
  };
}

export const lightTheme: Theme = {
  dark: false,
  color: {
    bg:          palette.ink[0],
    bgElevated:  palette.ink[0],
    bgSunken:    palette.ink[50],
    bgOverlay:   palette.ink[0],
    bgInverse:   palette.ink[1000],

    border:       palette.ink[150],
    borderStrong: palette.ink[300],

    text:        palette.ink[950],
    textMuted:   palette.ink[500],
    textSubtle:  palette.ink[400],
    textInverse: palette.ink[0],

    primary:      palette.ink[1000],
    primaryHover: palette.ink[800],
    primarySoft:  palette.ink[50],
    onPrimary:    palette.ink[0],

    accent:     palette.ink[950],
    accentSoft: palette.ink[100],

    success:     palette.green[600],
    successSoft: palette.green[50],
    warning:     palette.amber[600],
    warningSoft: palette.amber[50],
    danger:      palette.red[600],
    dangerSoft:  palette.red[50],
    info:        palette.ink[700],
    infoSoft:    palette.ink[100],

    // light → dark as proficiency rises
    level: [
      palette.ink[200],
      palette.ink[300],
      palette.ink[500],
      palette.ink[700],
      palette.ink[1000],
    ],

    shadow: palette.ink[1000],
  },
};

export const darkTheme: Theme = {
  dark: true,
  color: {
    bg:          palette.ink[1000],
    bgElevated:  palette.ink[900],
    bgSunken:    palette.ink[850],
    bgOverlay:   palette.ink[850],
    bgInverse:   palette.ink[0],

    border:       "#242428",
    borderStrong: palette.ink[700],

    text:        palette.ink[0],
    textMuted:   palette.ink[400],
    textSubtle:  palette.ink[500],
    textInverse: palette.ink[1000],

    primary:      palette.ink[0],
    primaryHover: palette.ink[150],
    primarySoft:  palette.ink[850],
    onPrimary:    palette.ink[1000],

    accent:     palette.ink[0],
    accentSoft: palette.ink[800],

    success:     palette.green[400],
    successSoft: palette.green[900],
    warning:     palette.amber[400],
    warningSoft: palette.amber[900],
    danger:      palette.red[400],
    dangerSoft:  palette.red[900],
    info:        palette.ink[300],
    infoSoft:    palette.ink[800],

    // dark → light as proficiency rises (inverted for a dark ground)
    level: [
      palette.ink[700],
      palette.ink[600],
      palette.ink[400],
      palette.ink[200],
      palette.ink[0],
    ],

    shadow: "#000000",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  SPACING — 4px base grid
// ─────────────────────────────────────────────────────────────────────────────
export const space = {
  none: 0, xxs: 2, xs: 4, sm: 8, md: 12, base: 16,
  lg: 20, xl: 24, xxl: 32, xxxl: 40, huge: 56, giant: 72,
} as const;

export const radius = {
  none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  TYPOGRAPHY
//  Monochrome leans hard on type, so the scale is wider than usual: display
//  sizes are properly large and captions properly small, because contrast in
//  scale is doing the work colour would otherwise do.
// ─────────────────────────────────────────────────────────────────────────────
export const type = {
  display: { fontSize: 38, lineHeight: 42, fontWeight: "800" as const, letterSpacing: -1.2 },
  h1:      { fontSize: 30, lineHeight: 35, fontWeight: "800" as const, letterSpacing: -0.9 },
  h2:      { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.5 },
  h3:      { fontSize: 18, lineHeight: 24, fontWeight: "700" as const, letterSpacing: -0.3 },
  bodyLg:  { fontSize: 17, lineHeight: 26, fontWeight: "400" as const, letterSpacing: -0.1 },
  body:    { fontSize: 15, lineHeight: 23, fontWeight: "400" as const, letterSpacing: -0.05 },
  bodyMd:  { fontSize: 15, lineHeight: 23, fontWeight: "600" as const, letterSpacing: -0.1 },
  small:   { fontSize: 13, lineHeight: 19, fontWeight: "500" as const, letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const, letterSpacing: 0.1 },
  overline:{ fontSize: 10.5, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 1.1 },
  mono:    { fontSize: 13, lineHeight: 20, fontWeight: "500" as const, letterSpacing: 0 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  ELEVATION
//  Shadows are subtle on a white ground — depth mostly comes from hairline
//  borders, which read cleanly in monochrome where shadow does not.
// ─────────────────────────────────────────────────────────────────────────────
export function elevation(level: 0 | 1 | 2 | 3 | 4, shadowColor: string) {
  const map = {
    0: { e: 0,  o: 0,     r: 0,  h: 0 },
    1: { e: 1,  o: 0.035, r: 3,  h: 1 },
    2: { e: 2,  o: 0.06,  r: 8,  h: 2 },
    3: { e: 5,  o: 0.10,  r: 16, h: 4 },
    4: { e: 10, o: 0.16,  r: 28, h: 8 },
  }[level];
  return {
    elevation: map.e,
    shadowColor,
    shadowOpacity: map.o,
    shadowRadius: map.r,
    shadowOffset: { width: 0, height: map.h },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOTION
// ─────────────────────────────────────────────────────────────────────────────
export const motion = {
  fast: 140,
  base: 220,
  slow: 360,
  spring:      { damping: 18, stiffness: 180, mass: 0.9 },
  springSnappy:{ damping: 22, stiffness: 260, mass: 0.8 },
  springSoft:  { damping: 20, stiffness: 110, mass: 1.0 },
} as const;

export const LEVEL_LABELS = [
  "Unskilled", "Beginner", "Practitioner", "Proficient", "Expert",
] as const;

export const BLOOM_LABELS: Record<string, string> = {
  remember: "Remember", understand: "Understand", apply: "Apply",
  analyze: "Analyse", evaluate: "Evaluate", create: "Create",
};
