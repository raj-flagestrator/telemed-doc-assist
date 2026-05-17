export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

import { rxStatusLabel, visitStatusClass, visitStatusLabel } from "./visitStatus";

/** @deprecated use visitStatusLabel */
export const statusLabel = visitStatusLabel;

export { rxStatusLabel };

/** @deprecated use visitStatusClass */
export const statusClass = visitStatusClass;
