import { useCallback, useEffect, useState } from "react";
import { api, type FulfillmentDetail } from "../api";
import { useApp } from "../context/AppContext";
import { PrescriptionTrackingId } from "../components/PrescriptionTrackingId";
import { fulfillmentLabel } from "../lib/statusLabels";

export function StepOrder() {
  const { token, fulfillmentId, setStep, setError, clearError, error } = useApp();
  const [detail, setDetail] = useState<FulfillmentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!token || !fulfillmentId) return;
    setLoading(true);
    try {
      const d = await api.getFulfillment(token, fulfillmentId);
      setDetail(d);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "Could not load order");
    } finally {
      setLoading(false);
    }
  }, [token, fulfillmentId, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>) {
    if (!token || !fulfillmentId) return;
    clearError();
    setBusy(true);
    try {
      const result = await action();
      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        (result as { status: string }).status === "rerouted"
      ) {
        setStep("dashboard");
        return;
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !detail) {
    return (
      <section className="card">
        <p>{loading ? "Loading order…" : "Order not found"}</p>
        {error && !loading ? <p className="alert">{error}</p> : null}
        <button type="button" className="btn btn-secondary" onClick={() => setStep("dashboard")}>
          Back to orders
        </button>
      </section>
    );
  }

  const status = detail.status;
  const canVerify = status === "queued";
  const canReserve = status === "insurance_verified";
  const canReady = status === "preparing" && detail.stockReserved;
  const canCreateDelivery = status === "ready_for_dispatch" && !detail.delivery;
  const canDispatch = status === "ready_for_dispatch" && !!detail.delivery;
  const isComplete = status === "dispatched";

  return (
    <section className="card">
      <h2>{isComplete ? "Order summary" : "Fill prescription"}</h2>
      <p className="sub">
        {detail.patient.fullName}
        {detail.patient.island ? ` · ${detail.patient.island}` : ""}
      </p>
      <p className="badge-inline">{fulfillmentLabel(status)}</p>
      {isComplete ? (
        <p className="sub hint">This order is complete. You can review details below.</p>
      ) : null}
      <PrescriptionTrackingId
        prescriptionId={detail.prescriptionId}
        trackingId={detail.trackingId}
        prominent
      />
      {error && <div className="alert">{error}</div>}

      <div className="panel">
        <h3>Patient & insurance</h3>
        <p>Phone: {detail.patient.phone}</p>
        <p>Insurance ID: {detail.patient.insuranceId ?? "None on file"}</p>
        <p>Insurance check: {detail.insuranceStatus}</p>
        {canVerify && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => run(() => api.verifyInsurance(token!, fulfillmentId!))}
          >
            Verify insurance
          </button>
        )}
      </div>

      <div className="panel">
        <h3>Medications & stock</h3>
        <ul className="meds">
          {detail.medications.map((m) => (
            <li key={m.name}>
              <strong>{m.name}</strong> — {m.dosage}, {m.frequency}, {m.duration}
            </li>
          ))}
        </ul>
        <ul className="stock-checks">
          {detail.stockChecks.map((s) => (
            <li key={s.name} className={s.available ? "" : "shortage"}>
              {s.name} ({s.dosage}): {s.available ? `${s.quantityOnHand} on hand` : "Out of stock"}
              {s.lowStock && s.available ? " · low" : ""}
            </li>
          ))}
        </ul>
        {canReserve && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => run(() => api.reserveStock(token!, fulfillmentId!))}
          >
            Reserve stock & start preparing
          </button>
        )}
        {canReady && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => run(() => api.markReady(token!, fulfillmentId!))}
          >
            Mark ready for dispatch
          </button>
        )}
      </div>

      <div className="panel">
        <h3>Delivery coordination</h3>
        {detail.delivery ? (
          <>
            <p>Status: {detail.delivery.status}</p>
            <p>ETA: {detail.delivery.etaMinutes} minutes</p>
            {detail.delivery.trackingSteps && (
              <ol className="tracking">
                {detail.delivery.trackingSteps.map((t) => (
                  <li key={t.label} className={t.completed ? "done" : ""}>
                    {t.label}
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <p className="sub">No courier assignment yet.</p>
        )}
        {canCreateDelivery && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              run(() =>
                api.createDelivery(
                  token!,
                  fulfillmentId!,
                  detail.prescriptionId,
                  detail.patient.id
                )
              )
            }
          >
            Create island delivery
          </button>
        )}
        {canDispatch && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => run(async () => {
              await api.dispatch(token!, fulfillmentId!);
              setStep("done");
            })}
          >
            Dispatch to patient island
          </button>
        )}
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => setStep("dashboard")}>
          Back to orders
        </button>
      </div>
    </section>
  );
}
