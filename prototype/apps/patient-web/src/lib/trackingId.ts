/** Matches medisphere.prescription_tracking.tracking_id_from_prescription_id */
export function trackingIdFromPrescriptionId(prescriptionId: string): string {
  const hex = prescriptionId.replace(/-/g, "").toUpperCase();
  return `RX-${hex.slice(0, 8)}`;
}

export function resolveTrackingId(
  prescriptionId?: string | null,
  trackingId?: string | null
): string | null {
  if (trackingId) return trackingId;
  if (prescriptionId) return trackingIdFromPrescriptionId(prescriptionId);
  return null;
}
