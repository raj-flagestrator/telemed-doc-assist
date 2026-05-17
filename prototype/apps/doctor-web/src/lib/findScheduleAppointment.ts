import { type AppointmentDetail, type ScheduleAppointment } from "../api";
import { resolveTrackingId } from "./trackingId";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function appointmentMatchesQuery(appt: ScheduleAppointment, raw: string): boolean {
  const q = raw.trim().toUpperCase();
  if (!q) return false;
  if (appt.id.toUpperCase().includes(q)) return true;
  if (appt.patient.fullName.toUpperCase().includes(q)) return true;
  const rx = appt.prescription;
  const tracking = resolveTrackingId(rx?.id, rx?.trackingId);
  if (tracking && tracking.toUpperCase().includes(q)) return true;
  if (rx?.id && rx.id.toUpperCase().includes(q)) return true;
  return false;
}

export function findAppointmentInList(
  appointments: ScheduleAppointment[],
  raw: string
): ScheduleAppointment | null {
  const q = raw.trim();
  if (!q) return null;
  return appointments.find((a) => appointmentMatchesQuery(a, q)) ?? null;
}

export function isAppointmentIdQuery(raw: string): boolean {
  return UUID_RE.test(raw.trim());
}

export function scheduleAppointmentFromDetail(detail: AppointmentDetail): ScheduleAppointment {
  const a = detail.appointment;
  return {
    id: a.id,
    patientId: a.patientId ?? "",
    specialty: a.specialty ?? "",
    language: a.language ?? "en",
    startAt: a.startAt,
    endAt: a.endAt,
    status: a.status,
    visitStatus: a.status,
    patient: detail.patient,
    consultation: detail.consultation ?? null,
    triage: detail.triage ?? null,
    prescription: detail.prescription ?? null,
    delivery: detail.delivery ?? null,
  };
}
