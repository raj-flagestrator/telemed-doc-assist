export const NOTIFICATIONS_CHANGED_EVENT = "medisphere-notifications-changed";

export function dispatchNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
