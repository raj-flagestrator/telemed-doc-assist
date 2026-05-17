export type ThemeMode = "light" | "dark";

const THEME_KEY = "medisphere_theme";
const NOTIFICATIONS_KEY = "medisphere_notifications";
export const PREFS_CHANGE_EVENT = "medisphere-prefs-change";

export function getTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === "dark" ? "dark" : "light";
}

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
  dispatchPrefsChange();
}

export function applyTheme(mode: ThemeMode = getTheme()): void {
  document.documentElement.dataset.theme = mode;
}

export function getNotificationsEnabled(): boolean {
  return localStorage.getItem(NOTIFICATIONS_KEY) !== "false";
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATIONS_KEY, enabled ? "true" : "false");
  dispatchPrefsChange();
}

export function dispatchPrefsChange(): void {
  window.dispatchEvent(new Event(PREFS_CHANGE_EVENT));
}
