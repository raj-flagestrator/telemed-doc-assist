import {
  api,
  type CarePrescription,
} from "../api";

/**
 * Load prescription for a visit using endpoints available on current BFF builds.
 * Prefers care appointment bundle; falls back when direct by-consultation route is missing.
 */
export async function fetchPrescriptionForVisit(
  token: string,
  consultationId: string,
  appointmentId?: string
): Promise<CarePrescription | null> {
  if (appointmentId) {
    const detail = await api.getCareAppointmentOptional(token, appointmentId);
    if (detail?.prescription) {
      return detail.prescription;
    }
  }

  const list = await api.getPatientPrescriptionsOptional(token);
  if (list?.prescriptions?.length) {
    if (appointmentId) {
      const byAppt = list.prescriptions.find((p) => p.appointmentId === appointmentId);
      if (byAppt) return byAppt;
    }
    const byConsult = list.prescriptions.find((p) => p.consultationId === consultationId);
    if (byConsult) return byConsult;
  }

  const direct = await api.getPrescriptionByConsultationOptional(token, consultationId);
  if (direct?.prescription) {
    return direct.prescription;
  }

  return null;
}
