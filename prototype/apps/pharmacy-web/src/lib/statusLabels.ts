export const FULFILLMENT_STATUSES = [
  "queued",
  "insurance_verified",
  "shortage",
  "preparing",
  "ready_for_dispatch",
  "dispatched",
  "rerouted",
] as const;

const FULFILLMENT_LABELS: Record<string, string> = {
  queued: "In queue",
  insurance_verified: "Insurance checked",
  shortage: "Stock shortage",
  preparing: "Preparing",
  ready_for_dispatch: "Ready to ship",
  dispatched: "Dispatched",
  rerouted: "Rerouted",
};

const DELIVERY_LABELS: Record<string, string> = {
  pending: "Delivery pending",
  in_transit: "In transit",
  dispatched: "Delivered",
};

export function fulfillmentLabel(status: string): string {
  return FULFILLMENT_LABELS[status] ?? status;
}

export function deliveryLabel(status: string): string {
  return DELIVERY_LABELS[status] ?? status;
}

export function isActiveFulfillment(status: string): boolean {
  return status !== "dispatched" && status !== "rerouted";
}
