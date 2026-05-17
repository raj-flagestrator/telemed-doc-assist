import type { ScheduleAppointment } from "../api";
import { visitStatusKey } from "./visitFilters";

export type DoctorKpiId = "active" | "in_consult" | "awaiting_rx" | "pharmacy_issues" | "completed";

const KPI_STATUSES: Record<DoctorKpiId, readonly string[]> = {
  active: [], // computed separately
  in_consult: ["in_progress"],
  awaiting_rx: ["awaiting_rx"],
  pharmacy_issues: ["shortage", "routed"],
  completed: ["completed", "delivered"],
};

export function countDoctorKpis(appointments: ScheduleAppointment[]): Record<DoctorKpiId, number> {
  const counts: Record<DoctorKpiId, number> = {
    active: 0,
    in_consult: 0,
    awaiting_rx: 0,
    pharmacy_issues: 0,
    completed: 0,
  };
  for (const a of appointments) {
    const key = visitStatusKey(a);
    if (!["completed", "delivered"].includes(key)) counts.active += 1;
    for (const kpi of Object.keys(KPI_STATUSES) as DoctorKpiId[]) {
      if (kpi === "active") continue;
      if (KPI_STATUSES[kpi].includes(key)) counts[kpi] += 1;
    }
  }
  return counts;
}

export function filterAppointmentsByKpi(
  appointments: ScheduleAppointment[],
  kpi: DoctorKpiId
): ScheduleAppointment[] {
  if (kpi === "active") {
    return appointments.filter((a) => !["completed", "delivered"].includes(visitStatusKey(a)));
  }
  const allowed = new Set(KPI_STATUSES[kpi]);
  return appointments.filter((a) => allowed.has(visitStatusKey(a)));
}

export const DOCTOR_KPI_LABELS: Record<DoctorKpiId, string> = {
  active: "Active",
  in_consult: "In consult",
  awaiting_rx: "Awaiting Rx",
  pharmacy_issues: "Pharmacy issues",
  completed: "Completed",
};
