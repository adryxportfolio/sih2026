import { Alert, Platform } from "react-native";

// Alert.alert is a no-op on react-native-web, so any confirm/notice built on it
// silently does nothing in the browser — which is exactly where the demo runs.
// These helpers fall back to the browser's own dialogs on web and use the native
// Alert everywhere else, so a single call site behaves correctly on every target.

export function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const {
    title,
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
  } = opts;

  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(text)
        : true,
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(text);
    }
    return;
  }
  Alert.alert(title, message ?? "");
}
