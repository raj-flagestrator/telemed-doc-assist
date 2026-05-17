import type { QueueItem } from "../api";
import { isActiveFulfillment } from "./statusLabels";

export type PharmacyKpiId = "active" | "new" | "shortages" | "low_stock";

const NEW_STATUSES = new Set(["queued", "insurance_verified"]);

export function countPharmacyKpis(
  orders: QueueItem[],
  lowStockCount: number
): Record<PharmacyKpiId, number> {
  let active = 0;
  let newCount = 0;
  let shortages = 0;
  for (const o of orders) {
    const s = o.fulfillmentStatus;
    if (isActiveFulfillment(s)) active += 1;
    if (NEW_STATUSES.has(s)) newCount += 1;
    if (s === "shortage") shortages += 1;
  }
  return {
    active,
    new: newCount,
    shortages,
    low_stock: lowStockCount,
  };
}

export function filterOrdersByKpi(orders: QueueItem[], kpi: PharmacyKpiId): QueueItem[] {
  if (kpi === "active") {
    return orders.filter((o) => isActiveFulfillment(o.fulfillmentStatus));
  }
  if (kpi === "new") {
    return orders.filter((o) => NEW_STATUSES.has(o.fulfillmentStatus));
  }
  if (kpi === "shortages") {
    return orders.filter((o) => o.fulfillmentStatus === "shortage");
  }
  return orders;
}

export const PHARMACY_KPI_LABELS: Record<PharmacyKpiId, string> = {
  active: "Active orders",
  new: "New",
  shortages: "Shortages",
  low_stock: "Low stock",
};
