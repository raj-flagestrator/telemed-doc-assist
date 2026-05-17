import { type CareAppointmentDetail, type CareVisit } from "../api";
import { resolveTrackingId } from "./trackingId";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function visitMatchesQuery(visit: CareVisit, raw: string): boolean {
  const q = raw.trim().toUpperCase();
  if (!q) return false;
  if (visit.appointmentId.toUpperCase().includes(q)) return true;
  const rx = visit.prescription;
  if (rx?.id && rx.id.toUpperCase().includes(q)) return true;
  const tracking = resolveTrackingId(rx?.id, rx?.trackingId);
  if (tracking && tracking.toUpperCase().includes(q)) return true;
  return false;
}

export function findVisitInList(visits: CareVisit[], raw: string): CareVisit | null {
  const q = raw.trim();
  if (!q) return null;
  return visits.find((v) => visitMatchesQuery(v, q)) ?? null;
}

export function isAppointmentIdQuery(raw: string): boolean {
  return UUID_RE.test(raw.trim());
}

export function visitFromCareDetail(detail: CareAppointmentDetail): CareVisit {
  const a = detail.appointment;
  return {
    appointmentId: a.id,
    startAt: a.startAt,
    endAt: a.endAt,
    practitionerName: a.practitionerName,
    specialty: a.specialty,
    appointmentStatus: a.status,
    visitStatus: detail.visitStatus,
    consultation: detail.consultation,
    prescription: detail.prescription,
    delivery: detail.delivery,
  };
}
