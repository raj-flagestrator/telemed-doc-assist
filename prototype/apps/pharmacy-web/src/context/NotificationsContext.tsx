import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FilterPanel } from "../components/FilterPanel";
import { NotificationsUnreadSync } from "../components/NotificationsUnreadSync";
import { useNotificationsEnabled } from "../hooks/useUserPreferences";

type NotificationsContextValue = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({
  children,
  panel,
  token,
}: {
  children: ReactNode;
  panel: ReactNode;
  token?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsOn = useNotificationsEnabled();

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(
    () => ({
      open,
      toggle,
      close,
      unreadCount: notificationsOn ? unreadCount : 0,
      setUnreadCount,
    }),
    [open, close, toggle, unreadCount, notificationsOn]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {token ? <NotificationsUnreadSync token={token} /> : null}
      {children}
      <FilterPanel open={open} onClose={close} title="Notifications">
        {panel}
      </FilterPanel>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}

export function NotificationBellHeaderButton({ onBeforeOpen }: { onBeforeOpen?: () => void }) {
  const { open, toggle, unreadCount } = useNotifications();
  const notificationsOn = useNotificationsEnabled();

  if (!notificationsOn) return null;

  function handleClick() {
    onBeforeOpen?.();
    toggle();
  }

  const badge =
    unreadCount > 0 ? (unreadCount > 9 ? "9+" : String(unreadCount)) : null;
  const countTitle =
    unreadCount > 0
      ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
      : "No unread notifications";

  return (
    <button
      type="button"
      className={`btn-notifications ${open ? "open" : ""}`}
      aria-label={badge ? `${unreadCount} notifications` : "Notifications"}
      title={countTitle}
      aria-expanded={open}
      onClick={handleClick}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {badge ? <span className="notifications-badge">{badge}</span> : null}
    </button>
  );
}
