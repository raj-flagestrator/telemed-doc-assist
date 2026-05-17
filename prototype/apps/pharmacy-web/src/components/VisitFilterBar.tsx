import {
  type CalendarDateFilter,
  EMPTY_CALENDAR_DATE,
} from "../lib/dateFilters";
import { statusLabel, type OrderStatusFilter } from "../lib/orderFilters";
import { FULFILLMENT_STATUSES } from "../lib/statusLabels";

const QUICK_STATUS_FILTERS: OrderStatusFilter[] = ["all", "active"];

export function VisitFilterBar({
  calendarDates,
  onCalendarDatesChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  dateScopedTotal,
}: {
  calendarDates: CalendarDateFilter;
  onCalendarDatesChange: (dates: CalendarDateFilter) => void;
  statusFilter: OrderStatusFilter;
  onStatusFilterChange: (filter: OrderStatusFilter) => void;
  statusCounts: Record<string, number>;
  dateScopedTotal: number;
}) {
  const allDates = !calendarDates.from && !calendarDates.to;

  function setFrom(from: string) {
    onCalendarDatesChange({ ...calendarDates, from: from || null });
  }

  function setTo(to: string) {
    onCalendarDatesChange({ ...calendarDates, to: to || null });
  }

  function countFor(id: OrderStatusFilter): number {
    if (id === "all") return dateScopedTotal;
    if (id === "active") return statusCounts.active ?? 0;
    return statusCounts[id] ?? 0;
  }

  function labelFor(id: OrderStatusFilter): string {
    if (id === "all") return "All";
    if (id === "active") return "Active";
    return statusLabel(id);
  }

  const statusOptions: OrderStatusFilter[] = [...QUICK_STATUS_FILTERS, ...FULFILLMENT_STATUSES];

  return (
    <div className="filter-bar filter-bar-panel">
      <div className="filter-block">
        <span className="filter-block-label">Date</span>
        <div className="filter-date-compact">
          <input
            type="date"
            className="filter-date-input"
            value={calendarDates.from ?? ""}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <span className="filter-date-sep" aria-hidden>
            –
          </span>
          <input
            type="date"
            className="filter-date-input"
            value={calendarDates.to ?? ""}
            min={calendarDates.from ?? undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
          {!allDates ? (
            <button
              type="button"
              className="filter-date-clear-link"
              onClick={() => onCalendarDatesChange(EMPTY_CALENDAR_DATE)}
            >
              Clear dates
            </button>
          ) : null}
        </div>
      </div>

      <div className="filter-block">
        <span className="filter-block-label">Status</span>
        <div className="filter-chips" role="tablist" aria-label="Filter by status">
          {statusOptions.map((id) => {
            const count = countFor(id);
            if (!QUICK_STATUS_FILTERS.includes(id) && count === 0 && statusFilter !== id) {
              return null;
            }
            return (
              <StatusChip
                key={id}
                id={id}
                label={labelFor(id)}
                count={count}
                selected={statusFilter === id}
                onSelect={onStatusFilterChange}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusChip({
  id,
  label,
  count,
  selected,
  onSelect,
}: {
  id: OrderStatusFilter;
  label: string;
  count: number;
  selected: boolean;
  onSelect: (id: OrderStatusFilter) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`filter-chip ${selected ? "active" : ""}`}
      onClick={() => onSelect(id)}
    >
      {label} <span className="chip-count">{count}</span>
    </button>
  );
}
