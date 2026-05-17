export function visitStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In consult";
    case "awaiting_rx":
      return "Awaiting Rx";
    case "ready":
      return "Ready";
    case "booked":
      return "Booked";
    case "signed":
      return "Signed";
    case "routed":
      return "Routed to pharmacy";
    case "shortage":
      return "Pharmacy shortage";
    case "preparing":
      return "Preparing";
    case "dispatched":
      return "Dispatched";
    case "in_transit":
      return "In transit";
    case "delivered":
      return "Delivered";
    default:
      return status.replace(/_/g, " ");
  }
}

export function visitStatusClass(status: string): string {
  if (["completed", "delivered", "signed"].includes(status)) return "badge badge-done";
  if (status === "in_progress") return "badge badge-live";
  if (status === "awaiting_rx") return "badge badge-warn";
  return "badge";
}
