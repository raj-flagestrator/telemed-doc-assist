import { useEffect, useState } from "react";
import { type CareAppointmentDetail } from "../api";
import { AppointmentId } from "../components/AppointmentId";
import { ConfirmDeliveryReceived } from "../components/ConfirmDeliveryReceived";
import { RoutingTrail } from "../components/RoutingTrail";
import { VisitReferenceIds } from "../components/VisitReferenceIds";
import { useApp } from "../context/AppContext";
import { formatWhen, rxStatusLabel, statusClass, statusLabel } from "../lib/careStatus";
import { careDetailFromVisit, loadCareAppointmentDetail } from "../lib/loadCareAppointmentDetail";
import { visitStatusClass, visitStatusLabel } from "../lib/visitStatus";

export function StepCareDetail() {
  const {
    token,
    journey,
    selectedCareVisit,
    step,
    setStep,
    updateJourney,
    setError,
    clearError,
    error,
  } = useApp();
  const [detail, setDetail] = useState<CareAppointmentDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const appointmentId = journey.appointmentId;
  const fallback =
    selectedCareVisit?.appointmentId === appointmentId ? selectedCareVisit : null;

  useEffect(() => {
    if (step !== "careDetail" || !token || !appointmentId) {
      if (step !== "careDetail") {
        setBusy(false);
      }
      return;
    }

    let cancelled = false;
    setBusy(true);
    setLoadError(null);
    clearError();

    if (fallback) {
      setDetail(careDetailFromVisit(fallback));
    } else {
      setDetail(null);
    }

    loadCareAppointmentDetail(token, appointmentId, fallback)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoadError(null);
          if (d.prescription) {
            updateJourney({
              appointmentId: d.appointment.id,
              consultationId: d.prescription.consultationId ?? d.consultation?.id,
              prescriptionId: d.prescription.id,
              trackingId: d.prescription.trackingId,
              pharmacyName: d.prescription.pharmacyName,
            });
          }
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const message =
          e instanceof Error
            ? e.message
            : "Could not load visit details — restart backends: python scripts/run_all.py";
        if (fallback) {
          setDetail(careDetailFromVisit(fallback));
          setLoadError(message);
        } else {
          setLoadError(message);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, token, appointmentId, fallback, clearError, setError, updateJourney]);

  if (!appointmentId) {
    return (
      <section className="card">
        <h2>Visit details</h2>
        <p className="sub">No appointment selected.</p>
        <button type="button" className="btn btn-secondary" onClick={() => setStep("myCare")}>
          Back to My care
        </button>
      </section>
    );
  }

  if (busy && !detail) {
    return (
      <section className="card">
        <h2>Visit details</h2>
        <p className="sub">Loading your appointment…</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="card">
        <h2>Visit details</h2>
        {(loadError || error) && <div className="alert">{loadError ?? error}</div>}
        <button type="button" className="btn btn-secondary" onClick={() => setStep("myCare")}>
          Back to My care
        </button>
      </section>
    );
  }

  const appt = detail.appointment;
  const statusKey = detail.visitStatus;
  const consult = detail.consultation;
  const rx = detail.prescription;
  const delivery = detail.delivery;
  const triage = detail.triage;
  const triageResult = (triage?.result ?? {}) as Record<string, unknown>;
  const notes = consult?.notes?.trim();
  const pharmacy = delivery?.pharmacyName ?? rx?.pharmacyName ?? null;
  const needsPharmacyChoice = rx?.status === "signed" && !rx.pharmacyId;
  const declinedPharmacy = rx?.status === "pharmacy_declined";
  const rxPatientComplete = rx?.status === "completed";
  const canConfirmDelivery =
    !!token &&
    !!delivery &&
    !!rx &&
    (rx.status === "routed" || rx.status === "fulfilled") &&
    !rxPatientComplete;
  const canJoinConsult =
    statusKey === "booked" || statusKey === "ready" || statusKey === "in_progress";

  function joinConsultation() {
    updateJourney({
      appointmentId: appt.id,
      consultationId: consult?.id,
    });
    setStep("consult");
  }

  return (
    <section className="card">
      <h2>{appt.practitionerName}</h2>
      <p className="sub">
        {appt.specialty} · {appt.language} · {formatWhen(appt.startAt)}
      </p>
      <p className="sub">
        Visit status:{" "}
        <span className={visitStatusClass(statusKey)}>{visitStatusLabel(statusKey)}</span>
      </p>
      <AppointmentId id={appt.id} />
      {loadError && (
        <div className="alert alert-info">
          Showing saved summary — full details need a backend restart (<code>python scripts/run_all.py</code>
          ).
        </div>
      )}
      {error && !loadError && <div className="alert">{error}</div>}

      <div className="care-detail-panel">
        <h3>Appointment</h3>
        <ul className="care-detail-list">
          <li>Scheduled: {formatWhen(appt.startAt)}</li>
          <li>Ends: {formatWhen(appt.endAt)}</li>
          <li>
            Consultation:{" "}
            {consult ? (
              <span className={statusClass(consult.status)}>{statusLabel(consult.status)}</span>
            ) : (
              <span className="care-muted">Not started</span>
            )}
          </li>
        </ul>
      </div>

      {triage ? (
        <div className="care-detail-panel">
          <h3>Your triage summary</h3>
          <p className="care-meta">Symptoms: {(triage.symptoms ?? []).join(", ") || "—"}</p>
          <ul className="care-detail-list">
            <li>Risk: {String(triageResult.riskLevel ?? "—")}</li>
            <li>Recommended specialty: {String(triageResult.recommendedSpecialty ?? appt.specialty)}</li>
            {triageResult.recommendedAction ? <li>{String(triageResult.recommendedAction)}</li> : null}
          </ul>
        </div>
      ) : null}

      {consult?.completedAt || notes ? (
        <div className="care-detail-panel">
          <h3>Consultation notes</h3>
          <p className="care-notes">{notes || "No notes recorded for this visit."}</p>
          {consult?.completedAt ? (
            <p className="care-meta">Completed {formatWhen(consult.completedAt)}</p>
          ) : null}
        </div>
      ) : null}

      {rx ? (
        <div className="care-detail-panel">
          <h3>Prescription</h3>
          <VisitReferenceIds
            appointmentId={rx.appointmentId ?? appt.id}
            prescriptionId={rx.id}
            trackingId={rx.trackingId}
            prominent
          />
          <p className="care-meta">
            Status: <span className={statusClass(rx.status)}>{rxStatusLabel(rx.status)}</span>
            {rx.signedAt ? ` · Signed ${formatWhen(rx.signedAt)}` : ""}
          </p>
          <ul className="care-detail-list">
            {rx.medications.map((m, i) => (
              <li key={i}>
                <strong>{m.name}</strong> — {m.dosage}, {m.frequency}, {m.duration}
              </li>
            ))}
          </ul>
          <RoutingTrail history={rx.routingHistory} />
          {needsPharmacyChoice ? (
            <p className="care-meta">Choose a pharmacy in your patient journey to place an order.</p>
          ) : null}
          {declinedPharmacy ? (
            <p className="care-meta">You completed this visit without placing a pharmacy order.</p>
          ) : null}
        </div>
      ) : statusKey === "awaiting_rx" ? (
        <p className="care-empty">Your doctor is preparing your prescription.</p>
      ) : statusKey === "completed" ? (
        <p className="care-empty">No prescription is on file for this visit.</p>
      ) : null}

      {pharmacy ? (
        <div className="care-detail-panel">
          <h3>Pharmacy & delivery</h3>
          <p className="care-notes">{pharmacy}</p>
          {delivery ? (
            <p className="care-meta">
              Delivery:{" "}
              <span className={statusClass(delivery.status)}>{statusLabel(delivery.status)}</span>
              {delivery.etaMinutes ? ` · ETA ~${delivery.etaMinutes} min` : ""}
            </p>
          ) : rx ? (
            <p className="care-meta">Delivery not requested yet.</p>
          ) : null}
          {canConfirmDelivery ? (
            <ConfirmDeliveryReceived
              token={token!}
              deliveryId={delivery!.id}
              onConfirmed={() => {
                void loadCareAppointmentDetail(token!, appointmentId, fallback).then((d) => {
                  setDetail(d);
                  if (d.prescription) {
                    updateJourney({
                      prescriptionId: d.prescription.id,
                      deliveryId: d.delivery?.id,
                    });
                  }
                });
              }}
              onError={setError}
            />
          ) : null}
          {rxPatientComplete ? (
            <p className="care-meta confirm-delivery-done">
              You confirmed this prescription was delivered.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => setStep("myCare")}>
          Back to My care
        </button>
        {canJoinConsult ? (
          <button type="button" className="btn btn-primary" onClick={joinConsultation}>
            {statusKey === "in_progress" ? "Return to consultation" : "Join consultation"}
          </button>
        ) : null}
        {needsPharmacyChoice ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              updateJourney({
                appointmentId: appt.id,
                consultationId: consult?.id,
                prescriptionId: rx?.id,
              });
              setStep("prescription");
            }}
          >
            Choose pharmacy
          </button>
        ) : null}
        {rx && delivery && (rx.status === "routed" || rx.status === "fulfilled") ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              updateJourney({
                appointmentId: appt.id,
                consultationId: consult?.id,
                prescriptionId: rx.id,
                deliveryId: delivery.id,
              });
              setStep("delivery");
            }}
          >
            Track delivery
          </button>
        ) : null}
      </div>
    </section>
  );
}
