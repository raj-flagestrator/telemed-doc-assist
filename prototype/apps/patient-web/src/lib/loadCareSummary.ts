import { api, type CareConsultation, type CareDelivery, type CarePrescription, type CareSummary } from "../api";
import { buildCareSummaryFromParts } from "./buildCareSummary";

function isNotFoundError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return msg.includes("Not Found") || msg.includes("API not found") || (e as { status?: number })?.status === 404;
}

type AppointmentRow = {
  id: string;
  startAt: string;
  endAt: string;
  practitionerName: string;
  specialty: string;
  status: string;
};

async function loadFromParts(token: string): Promise<CareSummary | null> {
  const apptsRes = await api.getPatientAppointmentsOptional(token);
  if (!apptsRes) return null;

  const appointments = apptsRes.appointments as AppointmentRow[];
  const consults =
    (await api.getPatientConsultationsOptional(token))?.consultations ?? ([] as CareConsultation[]);
  const prescriptions =
    (await api.getPatientPrescriptionsOptional(token))?.prescriptions ?? ([] as CarePrescription[]);
  const deliveries =
    (await api.getPatientDeliveriesOptional(token))?.deliveries ?? ([] as CareDelivery[]);

  return buildCareSummaryFromParts(appointments, consults, prescriptions, deliveries);
}

/** Load care history; tolerates missing BFF routes and partial upstream failures. */
export async function loadCareSummary(token: string): Promise<CareSummary> {
  try {
    const data = await api.getCareSummary(token);
    if (data.needsProfile) return data;
    return data;
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
  }

  const fromParts = await loadFromParts(token);
  if (fromParts) return fromParts;

  return {
    upcomingAppointments: [],
    awaitingPrescription: [],
    pastVisits: [],
    needsProfile: false,
    staleBackend: true,
  };
}
