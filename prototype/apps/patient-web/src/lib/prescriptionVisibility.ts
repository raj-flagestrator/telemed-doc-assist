import type { CarePrescription } from "../api";

/** Keep in sync with medisphere.visit_status.PATIENT_HIDDEN_RX_STATUSES */
const PATIENT_HIDDEN_RX_STATUSES = new Set(["draft", "cancelled"]);

export function isPatientVisiblePrescription(
  rx: CarePrescription | null | undefined
): boolean {
  if (!rx) return false;
  return !PATIENT_HIDDEN_RX_STATUSES.has(rx.status);
}
