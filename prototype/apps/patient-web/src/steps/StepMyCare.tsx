import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRegisterMenuFilters } from "../context/AppMenuContext";
import { type CareSummary, type CareVisit } from "../api";
import { useApp } from "../context/AppContext";
import { VisitFilterBar } from "../components/VisitFilterBar";
import { formatWhen, rxStatusLabel, statusClass, statusLabel } from "../lib/careStatus";
import {
  EMPTY_CALENDAR_DATE,
  type CalendarDateFilter,
  filterByCalendarDate,
} from "../lib/dateFilters";
import { displayVisitStatus } from "../lib/visitStatus";
import { KpiStrip } from "../components/KpiStrip";
import {
  countPatientKpis,
  filterVisitsByKpi,
  PATIENT_KPI_LABELS,
  type PatientKpiId,
} from "../lib/patientKpis";
import {
  countVisitsByStatus,
  filterVisitsByStatus,
  mergeCareVisits,
  type StatusFilter,
} from "../lib/visitFilters";
import { AppointmentId } from "../components/AppointmentId";
import { VisitReferenceIds } from "../components/VisitReferenceIds";
import { loadCareSummary } from "../lib/loadCareSummary";
import { usePagination } from "../lib/pagination";
import { ListPagination } from "../components/ListPagination";
import { RefreshIconButton } from "../components/RefreshIconButton";
import { CollapseToggleButton } from "../components/CollapseToggleButton";
import { NewBookingIconButton } from "../components/NewBookingIconButton";
import { SearchIconButton } from "../components/SearchIconButton";
import { PrescriptionTrackingId } from "../components/PrescriptionTrackingId";
import {
  findVisitInList,
  isAppointmentIdQuery,
  visitFromCareDetail,
} from "../lib/findCareVisit";
import { loadCareAppointmentDetail } from "../lib/loadCareAppointmentDetail";

function CareVisitListCard({ visit, onOpen }: { visit: CareVisit; onOpen: (v: CareVisit) => void }) {
  const consult = visit.consultation;
  const rx = visit.prescription;
  const delivery = visit.delivery;
  const badge = displayVisitStatus(visit);
  const upcoming = badge === "booked" || badge === "ready";
  const [expanded, setExpanded] = useState(false);

  return (
    <li>
      <div className={`care-card list-card-shell${upcoming ? " care-card-upcoming" : ""}`}>
        <div className="list-card-top">
          <button type="button" className="list-card-primary" onClick={() => onOpen(visit)}>
            <div className="care-card-head">
              <strong>{visit.practitionerName}</strong>
              <span className={statusClass(badge)}>{statusLabel(badge)}</span>
            </div>
            <p className="care-meta">
              {visit.specialty} · {formatWhen(visit.startAt)}
            </p>
          </button>
          <CollapseToggleButton
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            label="visit details"
          />
        </div>
        {expanded ? (
          <div className="list-card-body">
            {!rx ? <AppointmentId id={visit.appointmentId} /> : null}
            <ul className="care-status-list">
              <li>
                <span>Consultation</span>
                {consult ? (
                  <span className={statusClass(consult.status)}>{statusLabel(consult.status)}</span>
                ) : (
                  <span className="care-muted">Not started</span>
                )}
              </li>
              <li>
                <span>Prescription</span>
                {rx ? (
                  <span className={statusClass(rx.status)}>{rxStatusLabel(rx.status)}</span>
                ) : (
                  <span className="care-muted">—</span>
                )}
              </li>
              <li>
                <span>Delivery</span>
                {delivery ? (
                  <span className={statusClass(delivery.status)}>{statusLabel(delivery.status)}</span>
                ) : rx ? (
                  <span className="care-muted">Not requested</span>
                ) : (
                  <span className="care-muted">—</span>
                )}
              </li>
            </ul>
            {rx ? (
              <VisitReferenceIds
                appointmentId={rx.appointmentId ?? visit.appointmentId}
                prescriptionId={rx.id}
                trackingId={rx.trackingId}
              />
            ) : null}
            {rx && rx.medications.length > 0 ? (
              <p className="care-meds">{rx.medications.map((m) => m.name).join(", ")}</p>
            ) : null}
            {rx?.status === "signed" && !rx.pharmacyId ? (
              <p className="care-meds">Action needed: choose a pharmacy to place your order</p>
            ) : null}
            {delivery?.pharmacyName || rx?.pharmacyName ? (
              <p className="care-meds">Pharmacy: {delivery?.pharmacyName ?? rx?.pharmacyName}</p>
            ) : null}
            <button type="button" className="care-card-hint care-card-hint-btn" onClick={() => onOpen(visit)}>
              View details
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function StepMyCare() {
  const { token, step, setStep, updateJourney, setSelectedCareVisit, setError, clearError, error } =
    useApp();
  const [summary, setSummary] = useState<CareSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [calendarDates, setCalendarDates] = useState<CalendarDateFilter>(EMPTY_CALENDAR_DATE);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kpiFilter, setKpiFilter] = useState<PatientKpiId | null>(null);
  const profileRedirected = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<CareVisit | null>(null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const reload = useCallback(async () => {
    if (!token) {
      setBusy(false);
      return;
    }
    setBusy(true);
    clearError();
    try {
      const data = await loadCareSummary(token);
      if (data.needsProfile) {
        if (!profileRedirected.current) {
          profileRedirected.current = true;
          setStep("profile");
        }
        return;
      }
      setSummary(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load your care history — restart backends: python scripts/run_all.py"
      );
    } finally {
      setBusy(false);
    }
  }, [token, clearError, setError, setStep]);

  useEffect(() => {
    if (step === "myCare") {
      void reload();
    }
  }, [step, reload]);

  const allVisits = useMemo(() => (summary ? mergeCareVisits(summary) : []), [summary]);
  const dateScopedVisits = useMemo(
    () => filterByCalendarDate(allVisits, calendarDates),
    [allVisits, calendarDates]
  );
  const filteredVisits = useMemo(() => {
    const byDate = filterByCalendarDate(allVisits, calendarDates);
    const list = kpiFilter ? filterVisitsByKpi(byDate, kpiFilter) : filterVisitsByStatus(byDate, statusFilter);
    return [...list].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [allVisits, calendarDates, statusFilter, kpiFilter]);
  const statusCounts = useMemo(() => countVisitsByStatus(dateScopedVisits), [dateScopedVisits]);
  const kpiCounts = useMemo(() => countPatientKpis(dateScopedVisits), [dateScopedVisits]);

  const filtersActive =
    Boolean(calendarDates.from || calendarDates.to) || statusFilter !== "all" || kpiFilter !== null;

  function onStatusFilterChange(next: StatusFilter) {
    setKpiFilter(null);
    setStatusFilter(next);
  }

  function selectKpi(id: PatientKpiId) {
    setKpiFilter((prev) => (prev === id ? null : id));
    setStatusFilter("all");
  }

  const kpiTiles = (Object.keys(PATIENT_KPI_LABELS) as PatientKpiId[]).map((id) => ({
    id,
    label: PATIENT_KPI_LABELS[id],
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
        dateScopedTotal={dateScopedVisits.length}
      />
    ),
    [calendarDates, statusFilter, statusCounts, dateScopedVisits.length]
  );

  useRegisterMenuFilters(filterPanel, filtersActive);

  const pagination = usePagination(filteredVisits);

  if (busy && !summary) {
    return (
      <section className="card">
        <div className="card-title-row">
          <h2>My care</h2>
          <RefreshIconButton onClick={() => void reload()} disabled spinning />
        </div>
        <p className="sub">Loading appointments and records…</p>
      </section>
    );
  }

  function openVisit(visit: CareVisit) {
    setSelectedCareVisit(visit);
    updateJourney({
      appointmentId: visit.appointmentId,
      consultationId: visit.consultation?.id,
      prescriptionId: visit.prescription?.id,
      trackingId: visit.prescription?.trackingId,
      deliveryId: visit.delivery?.id,
    });
    setStep("careDetail");
  }

  async function runSearch() {
    if (!token || !searchInput.trim()) return;
    clearError();
    setSearchBusy(true);
    setSearchResult(null);
    setSearchNotFound(false);
    try {
      let found = findVisitInList(allVisits, searchInput);
      if (!found && isAppointmentIdQuery(searchInput)) {
        const detail = await loadCareAppointmentDetail(token, searchInput.trim());
        found = visitFromCareDetail(detail);
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
        <h2>My care</h2>
        <div className="card-title-actions">
          <NewBookingIconButton onClick={() => setStep("triage")} disabled={busy} />
          <SearchIconButton active={searchOpen} onClick={() => setSearchOpen((open) => !open)} />
          <RefreshIconButton
            onClick={() => void reload()}
            disabled={busy}
            spinning={busy}
          />
        </div>
      </div>
      <p className="sub">Scheduled visits, prescriptions in progress, and completed care.</p>
      {searchOpen ? (
        <form className="panel verify-panel" onSubmit={onSearchSubmit}>
          <p className="sub hint">
            Search by appointment ID or prescription tracking ID (e.g. RX-A1B2C3D4).
          </p>
          <div className="verify-row">
            <input
              ref={searchInputRef}
              id="care-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="RX-XXXXXXXX or appointment ID"
              aria-label="Visit search"
              autoComplete="off"
              disabled={searchBusy}
            />
            <button type="submit" className="btn btn-secondary" disabled={searchBusy || !searchInput.trim()}>
              {searchBusy ? "Searching…" : "Search"}
            </button>
          </div>
          {searchNotFound ? <p className="sub care-empty">No visit matches that ID.</p> : null}
          {searchResult ? (
            <div className="verify-result">
              <AppointmentId id={searchResult.appointmentId} />
              {searchResult.prescription ? (
                <PrescriptionTrackingId
                  prescriptionId={searchResult.prescription.id}
                  trackingId={searchResult.prescription.trackingId}
                  prominent
                />
              ) : null}
              <p className="sub">
                <strong>{searchResult.practitionerName}</strong> · {searchResult.specialty}
              </p>
              <p className="sub hint">{formatWhen(searchResult.startAt)}</p>
              <p className="sub">
                <span className={statusClass(displayVisitStatus(searchResult))}>
                  {statusLabel(displayVisitStatus(searchResult))}
                </span>
              </p>
              <button type="button" className="btn btn-primary" onClick={() => openVisit(searchResult)}>
                View visit
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
      {summary?.staleBackend && (
        <div className="alert alert-info">
          Care history APIs need a backend restart. Run{" "}
          <code>python scripts/run_all.py</code> from the <code>prototype</code> folder, then refresh.
        </div>
      )}
      {error && <div className="alert">{error}</div>}

      {allVisits.length > 0 ? <KpiStrip tiles={kpiTiles} /> : null}

      {allVisits.length === 0 ? (
        <p className="care-empty">No visits yet. Book a consultation to get started.</p>
      ) : filteredVisits.length === 0 ? (
        <p className="care-empty">No visits match this filter.</p>
      ) : (
        <>
        <ul className="care-list">
          {pagination.pageItems.map((v) => (
            <CareVisitListCard key={v.appointmentId} visit={v} onOpen={openVisit} />
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

      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => setStep("triage")}>
          Book new visit
        </button>
      </div>
    </section>
  );
}
