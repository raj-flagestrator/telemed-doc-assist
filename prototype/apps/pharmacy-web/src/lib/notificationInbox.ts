import type { PharmacyNotification } from "../api";

export function inboxNotifications(notifications: PharmacyNotification[]): PharmacyNotification[] {
  return notifications.filter((n) => !n.read);
}

export function inboxCount(notifications: PharmacyNotification[]): number {
  return inboxNotifications(notifications).length;
}
