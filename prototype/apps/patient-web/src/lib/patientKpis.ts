import type { CareVisit } from "../api";
import { visitStatusKey } from "./visitFilters";

export type PatientKpiId = "upcoming" | "awaiting_rx" | "in_delivery" | "completed";

const KPI_STATUSES: Record<PatientKpiId, readonly string[]> = {
  upcoming: ["booked", "ready", "in_progress"],
  awaiting_rx: ["awaiting_rx"],
  in_delivery: ["routed", "shortage", "preparing", "dispatched", "in_transit", "delivered"],
  completed: ["completed"],
};

export function countPatientKpis(visits: CareVisit[]): Record<PatientKpiId, number> {
  const counts: Record<PatientKpiId, number> = {
    upcoming: 0,
    awaiting_rx: 0,
    in_delivery: 0,
    completed: 0,
  };
  for (const v of visits) {
    const key = visitStatusKey(v);
    for (const kpi of Object.keys(KPI_STATUSES) as PatientKpiId[]) {
      if (KPI_STATUSES[kpi].includes(key)) counts[kpi] += 1;
    }
  }
  return counts;
}

export function filterVisitsByKpi(visits: CareVisit[], kpi: PatientKpiId): CareVisit[] {
  const allowed = new Set(KPI_STATUSES[kpi]);
  return visits.filter((v) => allowed.has(visitStatusKey(v)));
}

export const PATIENT_KPI_LABELS: Record<PatientKpiId, string> = {
  upcoming: "Upcoming",
  awaiting_rx: "Awaiting Rx",
  in_delivery: "In delivery",
  completed: "Completed",
};
