import type { PharmacyNotification } from "../api";

export function inboxNotifications(notifications: PharmacyNotification[]): {
  actionItems: PharmacyNotification[];
  infoItems: PharmacyNotification[];
} {
  const unread = notifications.filter((x) => !x.read);
  const actionItems = unread.filter(
    (x) => x.type === "pharmacy_shortage" && x.payload.requiresDoctorAction === true
  );
  const infoItems = unread.filter(
    (x) =>
      x.type === "pharmacy_rerouted" ||
      (x.type === "pharmacy_shortage" && x.payload.autoRerouted === true)
  );
  return { actionItems, infoItems };
}

export function inboxCount(notifications: PharmacyNotification[]): number {
  const { actionItems, infoItems } = inboxNotifications(notifications);
  return actionItems.length + infoItems.length;
}
