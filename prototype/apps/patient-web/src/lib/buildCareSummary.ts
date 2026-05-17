import type { CareConsultation, CareDelivery, CarePrescription, CareSummary, CareVisit } from "../api";
import {
  latestConsultationByAppointment,
  prescriptionForAppointment,
} from "./careLinking";
import { isPatientVisiblePrescription } from "./prescriptionVisibility";

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

function careBucket(visitStatus: string): "upcoming" | "awaiting_rx" | "past" {
  if (visitStatus === "completed") return "past";
  if (visitStatus === "awaiting_rx") return "awaiting_rx";
  return "upcoming";
}

export function buildCareSummaryFromParts(
  appointments: Array<{
    id: string;
    startAt: string;
    endAt: string;
    practitionerName: string;
    specialty: string;
    status: string;
  }>,
  consultations: CareConsultation[],
  prescriptions: CarePrescription[],
  deliveries: CareDelivery[]
): CareSummary {
  const consultByAppt = latestConsultationByAppointment(consultations);
  const deliveryByRx = Object.fromEntries(deliveries.map((d) => [d.prescriptionId, d]));

  const upcoming: CareVisit[] = [];
  const awaitingPrescription: CareVisit[] = [];
  const pastVisits: CareVisit[] = [];

  for (const appt of appointments) {
    const consult = consultByAppt[appt.id] ?? null;
    let rx = prescriptionForAppointment(appt.id, prescriptions, consult?.id);
    if (rx && !isPatientVisiblePrescription(rx)) {
      rx = null;
    }
    const delivery = rx ? deliveryByRx[rx.id] ?? null : null;
    const vstatus = deriveVisitStatus(appt, consult, rx);

    const record: CareVisit = {
      appointmentId: appt.id,
      startAt: appt.startAt,
      endAt: appt.endAt,
      practitionerName: appt.practitionerName,
      specialty: appt.specialty,
      appointmentStatus: appt.status,
      visitStatus: vstatus,
      consultation: consult,
      prescription: rx
        ? {
            ...rx,
            appointmentId: rx.appointmentId ?? consult?.appointmentId ?? appt.id,
          }
        : null,
      delivery,
    };

    const bucket = careBucket(vstatus);
    if (bucket === "past") pastVisits.push(record);
    else if (bucket === "awaiting_rx") awaitingPrescription.push(record);
    else upcoming.push(record);
  }

  upcoming.sort((a, b) => a.startAt.localeCompare(b.startAt));
  awaitingPrescription.sort((a, b) => b.startAt.localeCompare(a.startAt));
  pastVisits.sort((a, b) => b.startAt.localeCompare(a.startAt));

  return { upcomingAppointments: upcoming, awaitingPrescription, pastVisits, needsProfile: false };
}
