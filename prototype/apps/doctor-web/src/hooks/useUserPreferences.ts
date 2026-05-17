import { useEffect, useState } from "react";
import {
  getNotificationsEnabled,
  getTheme,
  PREFS_CHANGE_EVENT,
  type ThemeMode,
} from "../lib/userPreferences";

export function useThemeMode(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>(() => getTheme());

  useEffect(() => {
    function sync() {
      setTheme(getTheme());
    }
    window.addEventListener(PREFS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(PREFS_CHANGE_EVENT, sync);
  }, []);

  return theme;
}

export function useNotificationsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => getNotificationsEnabled());

  useEffect(() => {
    function sync() {
      setEnabled(getNotificationsEnabled());
    }
    window.addEventListener(PREFS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(PREFS_CHANGE_EVENT, sync);
  }, []);

  return enabled;
}
