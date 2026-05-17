export function visitStatusLabel(status: string): string {
  const map: Record<string, string> = {
    booked: "Booked",
    completed: "Completed",
    ready: "Ready for consult",
    waiting: "Waiting for doctor",
    in_progress: "In progress",
    awaiting_rx: "Awaiting prescription",
    signed: "Choose pharmacy",
    routed: "Sent to pharmacy",
    fulfilled: "Pharmacy fulfilled",
    pharmacy_declined: "No pharmacy order",
    shortage: "Pharmacy shortage",
    preparing: "Preparing",
    dispatched: "Dispatched",
    in_transit: "In transit",
    delivered: "Delivered",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

/** Patient-confirmed Rx delivery complete (distinct from visit "completed"). */
export function rxStatusLabel(status: string): string {
  if (status === "completed") return "Complete";
  return visitStatusLabel(status);
}

export function visitStatusClass(status: string): string {
  if (["completed", "delivered", "signed", "fulfilled"].includes(status)) {
    return "care-badge care-badge-done";
  }
  if (["in_progress", "in_transit", "dispatched", "routed"].includes(status)) return "care-badge care-badge-active";
  if (["awaiting_rx", "waiting", "preparing", "booked", "ready"].includes(status)) {
    return "care-badge care-badge-pending";
  }
  return "care-badge";
}

export function displayVisitStatus(visit: { visitStatus?: string; appointmentStatus: string }): string {
  return visit.visitStatus ?? visit.appointmentStatus;
}
