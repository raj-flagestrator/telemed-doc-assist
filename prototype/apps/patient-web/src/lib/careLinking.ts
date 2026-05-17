import type { CareConsultation, CarePrescription } from "../api";

function isoKey(value: string | undefined | null): string {
  return value ?? "";
}

/** One consultation per appointment — most recently created wins. */
export function latestConsultationByAppointment(
  consultations: CareConsultation[]
): Record<string, CareConsultation> {
  const sorted = [...consultations].sort((a, b) =>
    isoKey(b.createdAt).localeCompare(isoKey(a.createdAt))
  );
  const byAppt: Record<string, CareConsultation> = {};
  for (const c of sorted) {
    if (c.appointmentId && !byAppt[c.appointmentId]) {
      byAppt[c.appointmentId] = c;
    }
  }
  return byAppt;
}

/** One prescription per consultation — most recently signed wins. */
export function latestPrescriptionByConsultation(
  prescriptions: CarePrescription[]
): Record<string, CarePrescription> {
  const sorted = [...prescriptions].sort((a, b) =>
    isoKey(b.signedAt).localeCompare(isoKey(a.signedAt))
  );
  const byConsult: Record<string, CarePrescription> = {};
  for (const r of sorted) {
    if (r.consultationId && !byConsult[r.consultationId]) {
      byConsult[r.consultationId] = r;
    }
  }
  return byConsult;
}

/** One prescription per appointment — most recently signed wins. */
export function latestPrescriptionByAppointment(
  prescriptions: CarePrescription[]
): Record<string, CarePrescription> {
  const sorted = [...prescriptions].sort((a, b) =>
    isoKey(b.signedAt).localeCompare(isoKey(a.signedAt))
  );
  const byAppt: Record<string, CarePrescription> = {};
  for (const r of sorted) {
    const apptId = r.appointmentId;
    if (apptId && !byAppt[apptId]) {
      byAppt[apptId] = r;
    }
  }
  return byAppt;
}

export function prescriptionForAppointment(
  appointmentId: string,
  prescriptions: CarePrescription[],
  consultationId?: string | null
): CarePrescription | null {
  const byAppt = latestPrescriptionByAppointment(prescriptions);
  if (byAppt[appointmentId]) {
    return byAppt[appointmentId];
  }
  if (consultationId) {
    return latestPrescriptionByConsultation(prescriptions)[consultationId] ?? null;
  }
  return null;
}
