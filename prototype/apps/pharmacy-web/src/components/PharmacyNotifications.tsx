import { useCallback, useEffect, useState } from "react";
import { api, type PharmacyNotification } from "../api";
import {
  NotificationDismissAllButton,
  NotificationDismissButton,
} from "./NotificationDismissControls";
import { useNotifications } from "../context/NotificationsContext";
import { useNotificationsEnabled } from "../hooks/useUserPreferences";
import { dispatchNotificationsChanged } from "../lib/notificationEvents";
import { inboxNotifications } from "../lib/notificationInbox";

export function PharmacyNotificationsPanel({ token }: { token: string }) {
  const notificationsOn = useNotificationsEnabled();
  const { setUnreadCount } = useNotifications();
  const [items, setItems] = useState<PharmacyNotification[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissAllBusy, setDismissAllBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyInbox = useCallback(
    (notifications: PharmacyNotification[]) => {
      const inbox = inboxNotifications(notifications);
      setItems(inbox);
      setUnreadCount(inbox.length);
    },
    [setUnreadCount]
  );

  const load = useCallback(async () => {
    const r = await api.getNotifications(token);
    applyInbox(r.notifications);
  }, [token, applyInbox]);

  useEffect(() => {
    if (!notificationsOn || !token) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    load().catch(() => {
      setItems([]);
      setUnreadCount(0);
    });
  }, [token, notificationsOn, setUnreadCount, load]);

  async function dismissOne(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.dismissNotification(token, id);
      setItems((prev) => {
        const next = prev.filter((n) => n.id !== id);
        setUnreadCount(next.length);
        return next;
      });
      dispatchNotificationsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not dismiss notification");
    } finally {
      setBusyId(null);
    }
  }

  async function dismissAll() {
    setDismissAllBusy(true);
    setError(null);
    try {
      await api.dismissAllNotifications(token);
      setItems([]);
      setUnreadCount(0);
      dispatchNotificationsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not dismiss notifications");
    } finally {
      setDismissAllBusy(false);
    }
  }

  if (!notificationsOn) {
    return <p className="sub">Notifications are turned off in menu preferences.</p>;
  }

  if (items.length === 0) {
    return (
      <p className="sub">
        No new alerts. Routed prescriptions appear in the Orders tab on your dashboard.
      </p>
    );
  }

  return (
    <div className="notifications-panel">
      <div className="notifications-toolbar">
        <NotificationDismissAllButton onClick={() => void dismissAll()} busy={dismissAllBusy} />
      </div>
      {error ? <p className="alert">{error}</p> : null}
      <ul className="notice-list notice-list--drawer">
        {items.map((n) => (
          <li key={n.id} className="notice-item">
            <NotificationDismissButton
              onClick={() => void dismissOne(n.id)}
              busy={busyId === n.id}
            />
            <strong>{String(n.payload.trackingId ?? "")}</strong>
            <p className="sub">{String(n.payload.message ?? "")}</p>
            {n.payload.fromPharmacyName ? (
              <p className="sub">From: {String(n.payload.fromPharmacyName)}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
