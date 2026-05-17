/** Calendar range filter (inclusive days, local timezone). Empty = any date. */

export interface CalendarDateFilter {
  from: string | null;
  to: string | null;
}

export const EMPTY_CALENDAR_DATE: CalendarDateFilter = { from: null, to: null };

function startOfDayFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function filterByCalendarDate<T extends { startAt: string }>(
  items: T[],
  dates: CalendarDateFilter
): T[] {
  if (!dates.from && !dates.to) return items;

  const rangeStart = dates.from ? startOfDayFromYmd(dates.from) : null;
  const rangeEnd = dates.to ? endOfDayFromYmd(dates.to) : null;
  if (dates.from && !dates.to && rangeStart) {
    const end = endOfDayFromYmd(dates.from);
    return items.filter((item) => {
      const at = new Date(item.startAt);
      return at >= rangeStart && at <= end;
    });
  }

  return items.filter((item) => {
    const at = new Date(item.startAt);
    if (rangeStart && at < rangeStart) return false;
    if (rangeEnd && at > rangeEnd) return false;
    return true;
  });
}

export function filterByCalendarField<T>(
  items: T[],
  dates: CalendarDateFilter,
  getIso: (item: T) => string
): T[] {
  if (!dates.from && !dates.to) return items;
  return filterByCalendarDate(
    items.map((item) => ({ item, startAt: getIso(item) })),
    dates
  ).map((row) => row.item);
}

export function formatCalendarSummary(dates: CalendarDateFilter): string {
  if (!dates.from && !dates.to) return "All dates";
  if (dates.from && dates.to && dates.from === dates.to) {
    return formatDisplayDate(dates.from);
  }
  if (dates.from && dates.to) {
    return `${formatDisplayDate(dates.from)} – ${formatDisplayDate(dates.to)}`;
  }
  if (dates.from) return `From ${formatDisplayDate(dates.from)}`;
  return `Until ${formatDisplayDate(dates.to!)}`;
}

function formatDisplayDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
