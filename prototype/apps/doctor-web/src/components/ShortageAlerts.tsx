import { useCallback, useEffect, useState } from "react";
import { api, type PharmacyNotification, type PharmacyOption } from "../api";
import {
  NotificationDismissAllButton,
  NotificationDismissButton,
} from "./NotificationDismissControls";
import { useNotifications } from "../context/NotificationsContext";
import { useNotificationsEnabled } from "../hooks/useUserPreferences";
import { dispatchNotificationsChanged } from "../lib/notificationEvents";
import { inboxNotifications } from "../lib/notificationInbox";

export function ShortageAlertsPanel({ token }: { token: string }) {
  const notificationsOn = useNotificationsEnabled();
  const { setUnreadCount } = useNotifications();
  const [items, setItems] = useState<PharmacyNotification[]>([]);
  const [infoItems, setInfoItems] = useState<PharmacyNotification[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissAllBusy, setDismissAllBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyInbox = useCallback(
    (notifications: PharmacyNotification[]) => {
      const { actionItems, infoItems: info } = inboxNotifications(notifications);
      setItems(actionItems);
      setInfoItems(info);
      setUnreadCount(actionItems.length + info.length);
    },
    [setUnreadCount]
  );

  const load = useCallback(async () => {
    const [n, p] = await Promise.all([
      api.getNotifications(token),
      api.getPharmacies(token),
    ]);
    setPharmacies(p.pharmacies);
    applyInbox(n.notifications);
  }, [token, applyInbox]);

  useEffect(() => {
    if (!notificationsOn) {
      setItems([]);
      setInfoItems([]);
      setUnreadCount(0);
      return;
    }
    load().catch(() => {
      setItems([]);
      setInfoItems([]);
      setUnreadCount(0);
    });
  }, [load, notificationsOn, setUnreadCount]);

  async function dismissOne(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.dismissNotification(token, id);
      await load();
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
      setInfoItems([]);
      setUnreadCount(0);
      dispatchNotificationsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not dismiss notifications");
    } finally {
      setDismissAllBusy(false);
    }
  }

  async function override(pharmacyId: string, prescriptionId: string, notificationId: string) {
    setBusyId(notificationId);
    setError(null);
    try {
      await api.overridePharmacy(token, prescriptionId, pharmacyId);
      await load();
      dispatchNotificationsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Override failed");
    } finally {
      setBusyId(null);
    }
  }

  const totalCount = items.length + infoItems.length;

  if (!notificationsOn) {
    return <p className="sub">Notifications are turned off in menu preferences.</p>;
  }

  if (totalCount === 0) {
    return <p className="sub">No alerts</p>;
  }

  return (
    <div className="shortage-alerts-drawer notifications-panel">
      <div className="notifications-toolbar">
        <NotificationDismissAllButton onClick={() => void dismissAll()} busy={dismissAllBusy} />
      </div>
      {error ? <div className="alert">{error}</div> : null}
      {infoItems.length > 0 ? (
        <>
          <p className="sub">Automatic reroutes (patient notified).</p>
          <ul className="shortage-list shortage-list--info">
            {infoItems.map((n) => (
              <li key={n.id} className="shortage-card shortage-card--info">
                <NotificationDismissButton
                  onClick={() => void dismissOne(n.id)}
                  busy={busyId === n.id}
                />
                <p>
                  <strong>{String(n.payload.trackingId ?? "")}</strong> —{" "}
                  {String(n.payload.message ?? "")}
                </p>
                {n.payload.toPharmacyName ? (
                  <p className="sub">Now at: {String(n.payload.toPharmacyName)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {items.length > 0 ? (
        <>
          <p className="sub">
            Select a pharmacy to reroute prescriptions that could not be fulfilled automatically.
          </p>
          <ul className="shortage-list">
            {items.map((n) => (
              <li key={n.id} className="shortage-card">
                <NotificationDismissButton
                  onClick={() => void dismissOne(n.id)}
                  busy={busyId === n.id}
                />
                <p>
                  <strong>{String(n.payload.trackingId ?? "")}</strong> —{" "}
                  {String(n.payload.message ?? "")}
                </p>
                <p className="sub">
                  Short: {(n.payload.shortageMedications as string[])?.join(", ") ?? "—"} · was at{" "}
                  {String(n.payload.fromPharmacyName ?? "")}
                </p>
                <label className="sub">
                  Route to pharmacy
                  <select
                    disabled={busyId === n.id}
                    defaultValue=""
                    onChange={(e) => {
                      const pid = e.target.value;
                      if (pid) override(pid, n.prescriptionId, n.id);
                    }}
                  >
                    <option value="" disabled>
                      Choose pharmacy…
                    </option>
                    {pharmacies.map((ph) => (
                      <option key={ph.id} value={ph.id}>
                        {ph.name} ({ph.location}){ph.isHub ? " · hub" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
