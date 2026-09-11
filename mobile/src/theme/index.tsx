import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, type Theme } from "./tokens";

export * from "./tokens";

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => (scheme === "dark" ? darkTheme : lightTheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Build StyleSheet-shaped styles that depend on the theme, memoised per theme.
 * Keeps components free of inline colour plumbing.
 */
export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
