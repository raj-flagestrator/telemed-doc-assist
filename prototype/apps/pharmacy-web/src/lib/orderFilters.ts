import type { QueueItem } from "../api";
import { type CalendarDateFilter, filterByCalendarField } from "./dateFilters";
import { FULFILLMENT_STATUSES, fulfillmentLabel, isActiveFulfillment } from "./statusLabels";

export type OrderStatusFilter = "all" | "active" | (typeof FULFILLMENT_STATUSES)[number];

export type OrderFilterGroup = {
  id: string;
  label: string;
  hint: string;
  statuses: readonly string[];
};

export const ORDER_FILTER_GROUPS: OrderFilterGroup[] = [
  {
    id: "queue",
    label: "Queue",
    hint: "New orders, insurance verified, or stock shortage",
    statuses: ["queued", "insurance_verified", "shortage"],
  },
  {
    id: "prep",
    label: "Preparation",
    hint: "Being prepared or ready for island dispatch",
    statuses: ["preparing", "ready_for_dispatch"],
  },
  {
    id: "complete",
    label: "Shipped & rerouted",
    hint: "Dispatched to delivery or rerouted to another pharmacy",
    statuses: ["dispatched", "rerouted"],
  },
];

export function statusLabel(status: string): string {
  return fulfillmentLabel(status);
}

export function countByStatus(orders: QueueItem[]): Record<string, number> {
  const counts: Record<string, number> = { all: orders.length, active: 0 };
  for (const s of FULFILLMENT_STATUSES) counts[s] = 0;
  for (const o of orders) {
    const key = o.fulfillmentStatus;
    counts[key] = (counts[key] ?? 0) + 1;
    if (isActiveFulfillment(key)) counts.active += 1;
  }
  return counts;
}

export function filterByStatus(orders: QueueItem[], filter: OrderStatusFilter): QueueItem[] {
  if (filter === "all") return orders;
  if (filter === "active") {
    return orders.filter((o) => isActiveFulfillment(o.fulfillmentStatus));
  }
  return orders.filter((o) => o.fulfillmentStatus === filter);
}

export function applyOrderFilters(
  orders: QueueItem[],
  dates: CalendarDateFilter,
  statusFilter: OrderStatusFilter
): QueueItem[] {
  const byDate = filterByCalendarField(orders, dates, (o) => o.signedAt);
  return filterByStatus(byDate, statusFilter);
}
