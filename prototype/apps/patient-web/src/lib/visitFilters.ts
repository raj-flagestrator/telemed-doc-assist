import type { CareVisit } from "../api";
import { type CalendarDateFilter, filterByCalendarDate } from "./dateFilters";
import { displayVisitStatus, visitStatusLabel } from "./visitStatus";

export const VISIT_STATUSES = [
  "booked",
  "ready",
  "in_progress",
  "awaiting_rx",
  "routed",
  "shortage",
  "preparing",
  "dispatched",
  "in_transit",
  "delivered",
  "completed",
] as const;

export type StatusFilter = "all" | "active" | (typeof VISIT_STATUSES)[number];

export type StatusFilterGroup = {
  id: string;
  label: string;
  hint: string;
  statuses: readonly string[];
};

/** Grouped status chips — expand a section to pick a specific stage. */
export const STATUS_FILTER_GROUPS: StatusFilterGroup[] = [
  {
    id: "appointment",
    label: "Appointment",
    hint: "Booking and getting ready for your visit",
    statuses: ["booked", "ready"],
  },
  {
    id: "consultation",
    label: "During visit",
    hint: "Video consultation and waiting for your doctor’s prescription",
    statuses: ["in_progress", "awaiting_rx"],
  },
  {
    id: "pharmacy",
    label: "Pharmacy & delivery",
    hint: "Medicine preparation and island delivery",
    statuses: ["routed", "shortage", "preparing", "dispatched", "in_transit"],
  },
  {
    id: "complete",
    label: "Complete",
    hint: "Finished visits and deliveries",
    statuses: ["delivered", "completed"],
  },
];

export function visitStatusKey(visit: CareVisit): string {
  return displayVisitStatus(visit);
}

export function isActiveVisitStatus(status: string): boolean {
  return !["completed", "delivered"].includes(status);
}

export function statusLabel(status: string): string {
  return visitStatusLabel(status);
}

export function countVisitsByStatus(visits: CareVisit[]): Record<string, number> {
  const counts: Record<string, number> = { all: visits.length, active: 0 };
  for (const s of VISIT_STATUSES) counts[s] = 0;
  for (const v of visits) {
    const key = visitStatusKey(v);
    counts[key] = (counts[key] ?? 0) + 1;
    if (isActiveVisitStatus(key)) counts.active += 1;
  }
  return counts;
}

export function filterVisitsByStatus(visits: CareVisit[], filter: StatusFilter): CareVisit[] {
  if (filter === "all") return visits;
  if (filter === "active") return visits.filter((v) => isActiveVisitStatus(visitStatusKey(v)));
  return visits.filter((v) => visitStatusKey(v) === filter);
}

export function applyVisitFilters(
  visits: CareVisit[],
  dates: CalendarDateFilter,
  statusFilter: StatusFilter
): CareVisit[] {
  const byDate = filterByCalendarDate(visits, dates);
  return filterVisitsByStatus(byDate, statusFilter);
}

export function groupForStatus(status: StatusFilter): string | null {
  if (status === "all" || status === "active") return null;
  for (const g of STATUS_FILTER_GROUPS) {
    if (g.statuses.includes(status)) return g.id;
  }
  return null;
}

export function mergeCareVisits(summary: {
  upcomingAppointments?: CareVisit[];
  awaitingPrescription?: CareVisit[];
  pastVisits?: CareVisit[];
}): CareVisit[] {
  const seen = new Set<string>();
  const out: CareVisit[] = [];
  for (const list of [
    summary.upcomingAppointments ?? [],
    summary.awaitingPrescription ?? [],
    summary.pastVisits ?? [],
  ]) {
    for (const v of list) {
      if (seen.has(v.appointmentId)) continue;
      seen.add(v.appointmentId);
      out.push(v);
    }
  }
  return out.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
}
