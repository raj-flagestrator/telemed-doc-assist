import { useState } from "react";
import {
  getNotificationsEnabled,
  getTheme,
  setNotificationsEnabled,
  setTheme,
  type ThemeMode,
} from "../lib/userPreferences";

export function MenuPreferences() {
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [notifications, setNotifications] = useState(() => getNotificationsEnabled());

  function selectTheme(mode: ThemeMode) {
    setTheme(mode);
    setThemeState(mode);
  }

  function toggleNotifications() {
    const next = !notifications;
    setNotificationsEnabled(next);
    setNotifications(next);
  }

  return (
    <section className="menu-section">
      <h3 className="menu-section-title">Preferences</h3>
      <div className="menu-pref-row">
        <span className="menu-pref-label">Theme</span>
        <div className="menu-segmented" role="group" aria-label="Theme">
          <button
            type="button"
            className={theme === "light" ? "active" : ""}
            onClick={() => selectTheme("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={theme === "dark" ? "active" : ""}
            onClick={() => selectTheme("dark")}
          >
            Dark
          </button>
        </div>
      </div>
      <div className="menu-pref-row">
        <span className="menu-pref-label">Notifications</span>
        <button
          type="button"
          role="switch"
          aria-checked={notifications}
          className={`menu-switch ${notifications ? "on" : ""}`}
          onClick={toggleNotifications}
        >
          <span className="menu-switch-thumb" />
          <span className="menu-switch-text">{notifications ? "On" : "Off"}</span>
        </button>
      </div>
    </section>
  );
}
