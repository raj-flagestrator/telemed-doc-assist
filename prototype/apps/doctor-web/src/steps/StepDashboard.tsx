import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRegisterMenuFilters } from "../context/AppMenuContext";
import { api, type ScheduleAppointment } from "../api";
import { useApp } from "../context/AppContext";
import { AppointmentId } from "../components/AppointmentId";
import { VisitFilterBar } from "../components/VisitFilterBar";
import {
  EMPTY_CALENDAR_DATE,
  type CalendarDateFilter,
  filterByCalendarDate,
} from "../lib/dateFilters";
import { KpiStrip } from "../components/KpiStrip";
import {
  countDoctorKpis,
  DOCTOR_KPI_LABELS,
  filterAppointmentsByKpi,
  type DoctorKpiId,
} from "../lib/doctorKpis";
import {
  countByStatus,
  filterByStatus,
  visitStatusKey,
  type StatusFilter,
} from "../lib/visitFilters";
import { visitStatusClass, visitStatusLabel } from "../lib/visitStatus";
import { usePagination } from "../lib/pagination";
import { ListPagination } from "../components/ListPagination";
import { RefreshIconButton } from "../components/RefreshIconButton";
import { CollapseToggleButton } from "../components/CollapseToggleButton";
import { SearchIconButton } from "../components/SearchIconButton";
import { PrescriptionTrackingId } from "../components/PrescriptionTrackingId";
import {
  findAppointmentInList,
  isAppointmentIdQuery,
  scheduleAppointmentFromDetail,
} from "../lib/findScheduleAppointment";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ScheduleAppointmentCard({
  appt,
  onOpen,
}: {
  appt: ScheduleAppointment;
  onOpen: (appt: ScheduleAppointment) => void;
}) {
  const statusKey = visitStatusKey(appt);
  const [expanded, setExpanded] = useState(false);

  return (
    <li>
      <div className="schedule-item list-card-shell">
        <div className="list-card-top">
          <button type="button" className="list-card-primary" onClick={() => onOpen(appt)}>
            <div className="care-card-head">
              <AppointmentId id={appt.id} compact />
              <span className={visitStatusClass(statusKey)}>{visitStatusLabel(statusKey)}</span>
            </div>
            <div className="list-card-second-row">
              <strong>{appt.patient.fullName}</strong>
              <span className="care-meta">{formatWhen(appt.startAt)}</span>
            </div>
          </button>
          <CollapseToggleButton
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            label="appointment details"
          />
        </div>
        {expanded ? (
          <div className="list-card-body schedule-item-details">
            {appt.triage?.result ? (
              <span className="meta">
                Triage: {String(appt.triage.result.recommendedSpecialty ?? appt.specialty)} · risk{" "}
                {String(appt.triage.result.riskLevel ?? "—")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function StepDashboard() {
  const { token, setStep, setVisit, setError, clearError, error } = useApp();
  const [items, setItems] = useState<ScheduleAppointment[]>([]);
  const [busy, setBusy] = useState(true);
  const [calendarDates, setCalendarDates] = useState<CalendarDateFilter>(EMPTY_CALENDAR_DATE);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kpiFilter, setKpiFilter] = useState<DoctorKpiId | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<ScheduleAppointment | null>(null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const reload = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    clearError();
    try {
      const data = await api.getSchedule(token);
      setItems(
        [...data.appointments].sort(
          (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load schedule");
    } finally {
      setBusy(false);
    }
  }, [token, clearError, setError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dateScoped = useMemo(() => filterByCalendarDate(items, calendarDates), [items, calendarDates]);
  const filteredItems = useMemo(() => {
    const byDate = filterByCalendarDate(items, calendarDates);
    const list = kpiFilter
      ? filterAppointmentsByKpi(byDate, kpiFilter)
      : filterByStatus(byDate, statusFilter);
    return [...list].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [items, calendarDates, statusFilter, kpiFilter]);
  const statusCounts = useMemo(() => countByStatus(dateScoped), [dateScoped]);
  const kpiCounts = useMemo(() => countDoctorKpis(dateScoped), [dateScoped]);

  const filtersActive =
    Boolean(calendarDates.from || calendarDates.to) || statusFilter !== "all" || kpiFilter !== null;

  function onStatusFilterChange(next: StatusFilter) {
    setKpiFilter(null);
    setStatusFilter(next);
  }

  function selectKpi(id: DoctorKpiId) {
    setKpiFilter((prev) => (prev === id ? null : id));
    setStatusFilter("all");
  }

  const kpiTiles = (Object.keys(DOCTOR_KPI_LABELS) as DoctorKpiId[]).map((id) => ({
    id,
    label: DOCTOR_KPI_LABELS[id],
    value: kpiCounts[id],
    selected: kpiFilter === id,
    onClick: () => selectKpi(id),
  }));

  const filterPanel = useMemo(
    () => (
      <VisitFilterBar
        calendarDates={calendarDates}
        onCalendarDatesChange={setCalendarDates}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        statusCounts={statusCounts}
        dateScopedTotal={dateScoped.length}
      />
    ),
    [calendarDates, statusFilter, statusCounts, dateScoped.length]
  );

  useRegisterMenuFilters(busy ? null : filterPanel, filtersActive, !busy);

  const pagination = usePagination(filteredItems);

  function openVisit(appt: ScheduleAppointment) {
    const triageResult = (appt.triage?.result ?? {}) as Record<string, unknown>;
    setVisit({
      appointmentId: appt.id,
      consultationId: appt.consultation?.id,
      patientName: appt.patient.fullName,
      specialty: appt.specialty,
      triageSymptoms: appt.triage?.symptoms ?? [],
      triageRiskLevel: String(triageResult.riskLevel ?? ""),
      notes: appt.consultation?.notes ?? undefined,
      visitStatus: appt.visitStatus ?? appt.status,
    });
    setStep("visit");
  }

  async function runSearch() {
    if (!token || !searchInput.trim()) return;
    clearError();
    setSearchBusy(true);
    setSearchResult(null);
    setSearchNotFound(false);
    try {
      let found = findAppointmentInList(items, searchInput);
      if (!found && isAppointmentIdQuery(searchInput)) {
        const detail = await api.getAppointment(token, searchInput.trim());
        found = scheduleAppointmentFromDetail(detail);
      }
      if (found) {
        setSearchResult(found);
      } else {
        setSearchNotFound(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearchBusy(false);
    }
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  return (
    <section className="card">
      <div className="card-title-row">
        <h2>Today&apos;s schedule</h2>
        <div className="card-title-actions">
          <SearchIconButton active={searchOpen} onClick={() => setSearchOpen((open) => !open)} />
          <RefreshIconButton
            onClick={() => void reload()}
            disabled={busy}
            spinning={busy}
          />
        </div>
      </div>
      <p className="sub">Telemedicine appointments booked by patients appear here.</p>
      {searchOpen ? (
        <form className="panel verify-panel" onSubmit={onSearchSubmit}>
          <p className="sub hint">
            Search by patient name, appointment ID, or RX tracking ID (e.g. RX-A1B2C3D4).
          </p>
          <div className="verify-row">
            <input
              ref={searchInputRef}
              id="schedule-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, RX-XXXXXXXX, or appointment ID"
              aria-label="Appointment search"
              autoComplete="off"
              disabled={searchBusy}
            />
            <button type="submit" className="btn btn-secondary" disabled={searchBusy || !searchInput.trim()}>
              {searchBusy ? "Searching…" : "Search"}
            </button>
          </div>
          {searchNotFound ? <p className="sub empty">No appointment matches that search.</p> : null}
          {searchResult ? (
            <div className="verify-result">
              <AppointmentId id={searchResult.id} />
              {searchResult.prescription ? (
                <PrescriptionTrackingId
                  prescriptionId={searchResult.prescription.id}
                  trackingId={searchResult.prescription.trackingId}
                  prominent
                />
              ) : null}
              <p className="sub">
                <strong>{searchResult.patient.fullName}</strong> · {formatWhen(searchResult.startAt)}
              </p>
              <p className="sub">
                <span className={visitStatusClass(visitStatusKey(searchResult))}>
                  {visitStatusLabel(visitStatusKey(searchResult))}
                </span>
              </p>
              <button type="button" className="btn btn-primary" onClick={() => openVisit(searchResult)}>
                Open appointment
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
      {error && <div className="alert">{error}</div>}
      {busy && <p className="sub">Loading appointments…</p>}

      {!busy && items.length > 0 ? (
        <KpiStrip tiles={kpiTiles} />
      ) : null}

      {!busy && (
        <>
          {items.length === 0 ? (
            <p className="empty">
              No appointments yet. Complete a patient booking on the patient app first.
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="empty">No appointments match these filters.</p>
          ) : (
            <>
            <ul className="schedule-list">
              {pagination.pageItems.map((appt) => (
                <ScheduleAppointmentCard key={appt.id} appt={appt} onOpen={openVisit} />
              ))}
            </ul>
            <ListPagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              canFirst={pagination.canFirst}
              canPrev={pagination.canPrev}
              canNext={pagination.canNext}
              canLast={pagination.canLast}
              onPageSizeChange={pagination.setPageSize}
              onFirst={pagination.goFirst}
              onPrev={pagination.goPrev}
              onNext={pagination.goNext}
              onLast={pagination.goLast}
            />
            </>
          )}
        </>
      )}
    </section>
  );
}
