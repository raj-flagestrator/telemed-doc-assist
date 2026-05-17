import {
  api,
  type CareAppointmentDetail,
  type CareConsultation,
  type CareDelivery,
  type CarePrescription,
  type CareVisit,
} from "../api";
import {
  latestConsultationByAppointment,
  prescriptionForAppointment,
} from "./careLinking";
import { isPatientVisiblePrescription } from "./prescriptionVisibility";
import { resolveTrackingId } from "./trackingId";

function isNotFoundError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return msg.includes("Not Found") || msg.includes("API not found") || (e as { status?: number })?.status === 404;
}

function deriveVisitStatus(
  appt: { status: string },
  consult: CareConsultation | null,
  rx: CarePrescription | null
): string {
  const rxReady = isPatientVisiblePrescription(rx);
  if (rxReady || appt.status === "completed") return "completed";
  if (consult) {
    if (consult.status === "completed") return "awaiting_rx";
    if (consult.status === "in_progress") return "in_progress";
    if (consult.status === "waiting") return "ready";
  }
  return appt.status || "booked";
}

type AppointmentRow = {
  id: string;
  patientId?: string;
  startAt: string;
  endAt: string;
  practitionerName: string;
  specialty: string;
  language?: string;
  status: string;
};

export function careDetailFromVisit(visit: CareVisit): CareAppointmentDetail {
  return {
    appointment: {
      id: visit.appointmentId,
      patientId: "",
      practitionerName: visit.practitionerName,
      specialty: visit.specialty,
      language: "en",
      startAt: visit.startAt,
      endAt: visit.endAt,
      status: visit.appointmentStatus,
    },
    visitStatus: visit.visitStatus ?? visit.appointmentStatus,
    consultation: visit.consultation,
    triage: null,
    prescription: visit.prescription,
    delivery: visit.delivery,
  };
}

async function loadFromParts(
  token: string,
  appointmentId: string,
  fallback?: CareVisit | null
): Promise<CareAppointmentDetail | null> {
  const apptsRes = await api.getPatientAppointmentsOptional(token);
  if (!apptsRes) return fallback ? careDetailFromVisit(fallback) : null;

  const appt = (apptsRes.appointments as AppointmentRow[]).find((a) => a.id === appointmentId);
  if (!appt) return fallback ? careDetailFromVisit(fallback) : null;

  const consults =
    (await api.getPatientConsultationsOptional(token))?.consultations ?? ([] as CareConsultation[]);
  const prescriptions =
    (await api.getPatientPrescriptionsOptional(token))?.prescriptions ?? ([] as CarePrescription[]);
  const deliveries =
    (await api.getPatientDeliveriesOptional(token))?.deliveries ?? ([] as CareDelivery[]);

  const consult = latestConsultationByAppointment(consults)[appointmentId] ?? null;
  let rx = prescriptionForAppointment(appointmentId, prescriptions, consult?.id);
  if (rx && !isPatientVisiblePrescription(rx)) {
    rx = null;
  }
  const delivery = rx ? deliveries.find((d) => d.prescriptionId === rx.id) ?? null : null;
  const vstatus = deriveVisitStatus(appt, consult, rx);

  return {
    appointment: {
      id: appt.id,
      patientId: appt.patientId ?? "",
      practitionerName: appt.practitionerName,
      specialty: appt.specialty,
      language: appt.language ?? "en",
      startAt: appt.startAt,
      endAt: appt.endAt,
      status: appt.status,
    },
    visitStatus: vstatus,
    consultation: consult,
    triage: null,
    prescription: rx,
    delivery,
  };
}

/** Load one appointment; falls back to list APIs or summary card data when BFF detail route is missing. */
export async function loadCareAppointmentDetail(
  token: string,
  appointmentId: string,
  fallback?: CareVisit | null
): Promise<CareAppointmentDetail> {
  try {
    const data = await api.getCareAppointment(token, appointmentId);
    if (data.prescription || !fallback?.prescription) {
      return data;
    }
    const tracking = resolveTrackingId(
      fallback.prescription.id,
      fallback.prescription.trackingId
    );
    if (tracking) {
      const byTracking = await api.getPrescriptionByTrackingOptional(token, tracking);
      if (
        byTracking?.prescription &&
        isPatientVisiblePrescription(byTracking.prescription) &&
        (!byTracking.prescription.appointmentId ||
          byTracking.prescription.appointmentId === appointmentId)
      ) {
        return { ...data, prescription: byTracking.prescription };
      }
    }
    return data;
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
  }

  const optional = await api.getCareAppointmentOptional(token, appointmentId);
  if (optional) return optional;

  const fromParts = await loadFromParts(token, appointmentId, fallback);
  if (fromParts) return fromParts;

  if (fallback) return careDetailFromVisit(fallback);

  throw new Error(
    "Could not load visit details — restart backends: python scripts/run_all.py"
  );
}
