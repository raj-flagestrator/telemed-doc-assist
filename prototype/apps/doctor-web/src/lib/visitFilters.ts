import type { ScheduleAppointment } from "../api";
import { type CalendarDateFilter, filterByCalendarDate } from "./dateFilters";
import { visitStatusLabel } from "./visitStatus";

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

export const STATUS_FILTER_GROUPS: StatusFilterGroup[] = [
  {
    id: "appointment",
    label: "Appointment",
    hint: "Patient booked and is ready to join",
    statuses: ["booked", "ready"],
  },
  {
    id: "consultation",
    label: "During visit",
    hint: "Live consultation or waiting for you to issue a prescription",
    statuses: ["in_progress", "awaiting_rx"],
  },
  {
    id: "pharmacy",
    label: "Pharmacy & delivery",
    hint: "Prescription at pharmacy or out for delivery",
    statuses: ["routed", "shortage", "preparing", "dispatched", "in_transit"],
  },
  {
    id: "complete",
    label: "Complete",
    hint: "Visit and delivery finished",
    statuses: ["delivered", "completed"],
  },
];

export function visitStatusKey(appt: ScheduleAppointment): string {
  return appt.visitStatus ?? appt.status;
}

export function isActiveVisitStatus(status: string): boolean {
  return !["completed", "delivered"].includes(status);
}

export function statusLabel(status: string): string {
  return visitStatusLabel(status);
}

export function countByStatus(appointments: ScheduleAppointment[]): Record<string, number> {
  const counts: Record<string, number> = { all: appointments.length, active: 0 };
  for (const s of VISIT_STATUSES) counts[s] = 0;
  for (const a of appointments) {
    const key = visitStatusKey(a);
    counts[key] = (counts[key] ?? 0) + 1;
    if (isActiveVisitStatus(key)) counts.active += 1;
  }
  return counts;
}

export function filterByStatus(appointments: ScheduleAppointment[], filter: StatusFilter): ScheduleAppointment[] {
  if (filter === "all") return appointments;
  if (filter === "active") {
    return appointments.filter((a) => isActiveVisitStatus(visitStatusKey(a)));
  }
  return appointments.filter((a) => visitStatusKey(a) === filter);
}

export function applyAppointmentFilters(
  appointments: ScheduleAppointment[],
  dates: CalendarDateFilter,
  statusFilter: StatusFilter
): ScheduleAppointment[] {
  return filterByStatus(filterByCalendarDate(appointments, dates), statusFilter);
}
