import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegisterMenuFilters } from "../context/AppMenuContext";
import { api, type QueueItem, type StockItem, type VerifyTrackingResult } from "../api";
import { useApp } from "../context/AppContext";
import { PrescriptionTrackingId } from "../components/PrescriptionTrackingId";
import { VisitFilterBar } from "../components/VisitFilterBar";
import {
  EMPTY_CALENDAR_DATE,
  type CalendarDateFilter,
  filterByCalendarField,
} from "../lib/dateFilters";
import { KpiStrip } from "../components/KpiStrip";
import {
  countPharmacyKpis,
  filterOrdersByKpi,
  PHARMACY_KPI_LABELS,
  type PharmacyKpiId,
} from "../lib/pharmacyKpis";
import {
  countByStatus,
  filterByStatus,
  type OrderStatusFilter,
} from "../lib/orderFilters";
import { deliveryLabel, fulfillmentLabel } from "../lib/statusLabels";
import { usePagination } from "../lib/pagination";
import { ListPagination } from "../components/ListPagination";
import { RefreshIconButton } from "../components/RefreshIconButton";
import { CollapseToggleButton } from "../components/CollapseToggleButton";
import { SearchIconButton } from "../components/SearchIconButton";

function formatSignedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function orderDeliverySummary(item: QueueItem): string {
  if (item.deliveryStatus) return deliveryLabel(item.deliveryStatus);
  if (
    item.fulfillmentStatus === "ready_for_dispatch" ||
    item.fulfillmentStatus === "dispatched"
  ) {
    return "not assigned";
  }
  return "—";
}

function QueueOrderCard({
  item,
  onOpen,
}: {
  item: QueueItem;
  onOpen: (fulfillmentId: string) => void;
}) {
  const done = item.fulfillmentStatus === "dispatched";
  const [expanded, setExpanded] = useState(false);

  return (
    <li>
      <div
        className={`queue-card list-card-shell ${done ? "queue-card-done" : ""}`}
      >
        <div className="list-card-top">
          <button type="button" className="list-card-primary" onClick={() => onOpen(item.fulfillmentId)}>
            <div className="queue-card-head">
              <PrescriptionTrackingId
                prescriptionId={item.prescriptionId}
                trackingId={item.trackingId}
                compact
              />
              <span className={`badge status-${item.fulfillmentStatus}`}>
                {fulfillmentLabel(item.fulfillmentStatus)}
              </span>
            </div>
            <strong className="list-card-title">{item.patientName}</strong>
            <p className="list-card-summary-meta">
              Insurance: {item.insuranceStatus} · Delivery: {orderDeliverySummary(item)}
            </p>
          </button>
          <CollapseToggleButton
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            label="order details"
          />
        </div>
        {expanded ? (
          <div className="list-card-body">
            <p className="sub">
              {item.medicationsSummary} · {item.medicationCount} line(s)
            </p>
            <p className="sub hint">
              {item.patientIsland ? `Island: ${item.patientIsland}` : "Island not set"}
              {item.insuranceId ? ` · Insurance: ${item.insuranceId}` : " · Self-pay likely"}
              {` · ${formatSignedAt(item.signedAt)}`}
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function StepDashboard() {
  const { token, setStep, setFulfillmentId, setError, clearError, error } = useApp();
  const [tab, setTab] = useState<"orders" | "stock">("orders");
  const [orders, setOrders] = useState<QueueItem[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [lowCount, setLowCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [calendarDates, setCalendarDates] = useState<CalendarDateFilter>(EMPTY_CALENDAR_DATE);
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("active");
  const [orderKpi, setOrderKpi] = useState<PharmacyKpiId | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyTrackingResult | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const verifyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (verifyOpen) {
      verifyInputRef.current?.focus();
    }
  }, [verifyOpen]);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const [orderRes, s] = await Promise.all([api.getOrders(token), api.getStock(token)]);
      const list = orderRes.orders ?? orderRes.queue ?? [];
      setOrders(
        [...list].sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())
      );
      setStock(s.items);
      setLowCount(s.lowStockCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setBusy(false);
    }
  }, [token, setError]);

  useEffect(() => {
    clearError();
    void load();
  }, [load, clearError]);

  const dateScoped = useMemo(
    () => filterByCalendarField(orders, calendarDates, (o) => o.signedAt),
    [orders, calendarDates]
  );
  const filteredOrders = useMemo(() => {
    const byDate = filterByCalendarField(orders, calendarDates, (o) => o.signedAt);
    const list =
      orderKpi && orderKpi !== "low_stock"
        ? filterOrdersByKpi(byDate, orderKpi)
        : filterByStatus(byDate, statusFilter);
    return [...list].sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());
  }, [orders, calendarDates, statusFilter, orderKpi]);
  const statusCounts = useMemo(() => countByStatus(dateScoped), [dateScoped]);
  const kpiCounts = useMemo(
    () => countPharmacyKpis(dateScoped, lowCount),
    [dateScoped, lowCount]
  );

  const filtersActive =
    Boolean(calendarDates.from || calendarDates.to) ||
    statusFilter !== "active" ||
    orderKpi !== null;

  function onStatusFilterChange(next: OrderStatusFilter) {
    setOrderKpi(null);
    setStatusFilter(next);
  }

  function selectOrderKpi(id: PharmacyKpiId) {
    if (id === "low_stock") {
      setTab("stock");
      setOrderKpi(null);
      setStatusFilter("active");
      return;
    }
    setTab("orders");
    setOrderKpi((prev) => (prev === id ? null : id));
    setStatusFilter("all");
  }

  const kpiTiles = (Object.keys(PHARMACY_KPI_LABELS) as PharmacyKpiId[]).map((id) => ({
    id,
    label: PHARMACY_KPI_LABELS[id],
    value: kpiCounts[id],
    selected: id !== "low_stock" && orderKpi === id,
    onClick: () => selectOrderKpi(id),
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

  useRegisterMenuFilters(
    busy || tab !== "orders" ? null : filterPanel,
    filtersActive,
    !busy && tab === "orders"
  );

  const pagination = usePagination(filteredOrders);

  function openOrder(fulfillmentId: string) {
    setFulfillmentId(fulfillmentId);
    setStep("order");
  }

  async function runVerify() {
    if (!token || !verifyInput.trim()) return;
    clearError();
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const result = await api.verifyTracking(token, verifyInput.trim());
      setVerifyResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  function onVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    void runVerify();
  }

  return (
    <section className="card">
      <div className="card-title-row operations-title-row">
        <h2>Operations</h2>
        <SearchIconButton
          active={verifyOpen}
          onClick={() => setVerifyOpen((open) => !open)}
        />
      </div>
      <p className="sub">All prescription orders, stock levels, and island delivery coordination.</p>
      {error && <div className="alert">{error}</div>}

      {verifyOpen ? (
        <form className="panel verify-panel" onSubmit={onVerifySubmit}>
          <p className="sub hint">Enter the tracking ID from the patient or doctor (e.g. RX-A1B2C3D4).</p>
        <div className="verify-row">
          <input
            ref={verifyInputRef}
            id="tracking-verify-input"
            type="text"
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value.toUpperCase())}
            placeholder="RX-XXXXXXXX"
            aria-label="Prescription tracking ID"
            autoComplete="off"
            disabled={verifyBusy}
          />
          <button type="submit" className="btn btn-secondary" disabled={verifyBusy || !verifyInput.trim()}>
            {verifyBusy ? "Checking…" : "Verify"}
          </button>
        </div>
        {verifyResult ? (
          <div className="verify-result">
            <PrescriptionTrackingId
              prescriptionId={verifyResult.prescriptionId}
              trackingId={verifyResult.trackingId}
              prominent
            />
            <p className="sub">
              <strong>{verifyResult.patientName}</strong>
              {verifyResult.patientIsland ? ` · ${verifyResult.patientIsland}` : ""}
            </p>
            <p className="sub">{verifyResult.medicationsSummary}</p>
            <p className="sub hint">
              Rx {verifyResult.prescriptionStatus} · Fulfillment{" "}
              {fulfillmentLabel(verifyResult.fulfillmentStatus)}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openOrder(verifyResult.fulfillmentId)}
            >
              Open order
            </button>
          </div>
        ) : null}
        </form>
      ) : null}

      {!busy ? <KpiStrip tiles={kpiTiles} /> : null}

      <div className="tab-row">
        <button
          type="button"
          className={`tab ${tab === "orders" ? "active" : ""}`}
          onClick={() => {
            setTab("orders");
            setOrderKpi(null);
          }}
        >
          Orders ({orders.length})
        </button>
        <button
          type="button"
          className={`tab ${tab === "stock" ? "active" : ""}`}
          onClick={() => setTab("stock")}
        >
          Stock {lowCount > 0 ? `· ${lowCount} low` : ""}
        </button>
        <RefreshIconButton
          className="tab-row-refresh"
          onClick={() => void load()}
          disabled={busy}
          spinning={busy}
        />
      </div>

      {busy ? (
        <p className="sub">Loading…</p>
      ) : tab === "orders" ? (
        <>
          {filteredOrders.length === 0 ? (
            <p className="sub empty-hint">
              {orders.length === 0
                ? "No routed prescriptions yet. Complete a patient visit with an ePrescription routed to your pharmacy to see orders here."
                : "No orders match this filter."}
            </p>
          ) : (
            <>
            <ul className="queue-list">
              {pagination.pageItems.map((item) => (
                <QueueOrderCard key={item.fulfillmentId} item={item} onOpen={openOrder} />
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
      ) : (
        <div className="stock-table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <tr key={`${row.medicationName}-${row.dosage}`} className={row.lowStock ? "low" : ""}>
                  <td>{row.medicationName}</td>
                  <td>{row.dosage}</td>
                  <td>{row.quantity}</td>
                  <td>
                    <span className={`stock-status ${row.lowStock ? "stock-status-low" : "stock-status-ok"}`}>
                      {row.lowStock ? "Low stock" : "In stock"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
