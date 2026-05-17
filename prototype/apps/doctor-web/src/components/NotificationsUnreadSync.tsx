import { useCallback, useEffect } from "react";
import { api } from "../api";
import { useNotifications } from "../context/NotificationsContext";
import { useNotificationsEnabled } from "../hooks/useUserPreferences";
import { NOTIFICATIONS_CHANGED_EVENT } from "../lib/notificationEvents";
import { inboxCount } from "../lib/notificationInbox";

export function NotificationsUnreadSync({ token }: { token: string }) {
  const notificationsOn = useNotificationsEnabled();
  const { setUnreadCount } = useNotifications();

  const refresh = useCallback(async () => {
    if (!notificationsOn || !token) {
      setUnreadCount(0);
      return;
    }
    try {
      const r = await api.getNotifications(token);
      setUnreadCount(inboxCount(r.notifications));
    } catch {
      setUnreadCount(0);
    }
  }, [notificationsOn, token, setUnreadCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  return null;
}
