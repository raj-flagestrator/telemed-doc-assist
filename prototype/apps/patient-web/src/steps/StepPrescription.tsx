import { useEffect, useState } from "react";
import type { CarePrescription } from "../api";
import { api, type PharmacyOption } from "../api";
import { AppointmentId } from "../components/AppointmentId";
import { VisitReferenceIds } from "../components/VisitReferenceIds";
import { useApp } from "../context/AppContext";
import { fetchPrescriptionForVisit } from "../lib/fetchPrescriptionForVisit";
import { isPatientVisiblePrescription } from "../lib/prescriptionVisibility";

const POLL_MS = 3000;

function isReady(rx: CarePrescription | null): boolean {
  return isPatientVisiblePrescription(rx);
}

function needsPharmacyChoice(rx: CarePrescription | null): boolean {
  return !!rx && rx.status === "signed" && !rx.pharmacyId;
}

function pharmacyOptionLabel(p: PharmacyOption, recommendedId: string | null): string {
  const parts = [p.name, p.location];
  if (p.isHub) parts.push("Regional hub");
  if (p.id === recommendedId) parts.push("Recommended");
  return parts.join(" · ");
}

export function StepPrescription() {
  const { token, journey, setStep, updateJourney, setError, clearError, error } = useApp();
  const [rx, setRx] = useState<CarePrescription | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [recommendReason, setRecommendReason] = useState<string | null>(null);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | null>(null);
  const [routingBusy, setRoutingBusy] = useState(false);

  useEffect(() => {
    if (!token || (!journey.consultationId && !journey.appointmentId)) return;
    let cancelled = false;

    async function load() {
      try {
        clearError();
        const prescription = await fetchPrescriptionForVisit(
          token!,
          journey.consultationId ?? "",
          journey.appointmentId
        );
        if (cancelled) return;
        if (isReady(prescription)) {
          setRx(prescription);
          setWaiting(false);
          updateJourney({
            consultationId: prescription!.consultationId ?? journey.consultationId,
            prescriptionId: prescription!.id,
            trackingId: prescription!.trackingId,
            pharmacyName: prescription!.pharmacyName,
          });
        } else {
          setRx(null);
          setWaiting(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not check prescription status");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, journey.consultationId, journey.appointmentId, updateJourney, setError, clearError]);

  useEffect(() => {
    if (!token || (!journey.consultationId && !journey.appointmentId)) return;
    function onFocus() {
      void (async () => {
        try {
          const prescription = await fetchPrescriptionForVisit(
            token!,
            journey.consultationId ?? "",
            journey.appointmentId
          );
          if (isReady(prescription)) {
            setRx(prescription);
            setWaiting(false);
            updateJourney({
              consultationId: prescription!.consultationId ?? journey.consultationId,
              prescriptionId: prescription!.id,
              trackingId: prescription!.trackingId,
              pharmacyName: prescription!.pharmacyName,
            });
          }
        } catch {
          /* polling handles errors */
        }
      })();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [token, journey.consultationId, journey.appointmentId, updateJourney]);

  useEffect(() => {
    if (!token || !rx?.id || !needsPharmacyChoice(rx)) return;
    let cancelled = false;

    async function loadPharmacies() {
      try {
        const data = await api.getPharmacyRecommendation(token!, rx!.id);
        if (cancelled) return;
        setPharmacies(data.pharmacies);
        setRecommendedId(data.recommended.pharmacyId);
        setRecommendReason(data.recommended.routingReason);
        setSelectedPharmacyId((prev) => prev ?? data.recommended.pharmacyId);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load pharmacies");
        }
      }
    }

    void loadPharmacies();
    return () => {
      cancelled = true;
    };
  }, [token, rx?.id, rx?.status, setError]);

  async function placeOrder() {
    if (!token || !rx || !selectedPharmacyId) return;
    clearError();
    setRoutingBusy(true);
    try {
      const routed = await api.routePrescription(token, rx.id, selectedPharmacyId);
      const updated: CarePrescription = {
        ...rx,
        status: "routed",
        pharmacyId: routed.pharmacyId,
        pharmacyName: routed.pharmacyName,
      };
      setRx(updated);
      updateJourney({
        prescriptionId: updated.id,
        pharmacyName: routed.pharmacyName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place pharmacy order");
    } finally {
      setRoutingBusy(false);
    }
  }

  async function skipPharmacyOrder() {
    if (!token || !rx) return;
    clearError();
    setRoutingBusy(true);
    try {
      await api.declinePharmacyOrder(token, rx.id);
      const updated: CarePrescription = { ...rx, status: "pharmacy_declined" };
      setRx(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete visit");
    } finally {
      setRoutingBusy(false);
    }
  }

  const ready = isReady(rx);
  const choosePharmacy = needsPharmacyChoice(rx);
  const routed = rx?.status === "routed";
  const declined = rx?.status === "pharmacy_declined";

  return (
    <section className="card">
      <h2>ePrescription</h2>
      {ready ? (
        <p className="sub">
          {choosePharmacy
            ? "Your doctor signed your prescription. Review the medications below, then choose a pharmacy to place your order—or finish without ordering."
            : declined
              ? "You completed this visit without placing a pharmacy order. Your prescription record is saved for your reference."
              : routed
                ? `Order placed at ${journey.pharmacyName ?? rx?.pharmacyName}. The pharmacy will prepare your medicines.`
                : "Digitally signed by your doctor."}
        </p>
      ) : (
        <p className="sub">
          {waiting
            ? "Waiting for your doctor to review and digitally sign your prescription…"
            : "Your prescription is not ready yet."}
        </p>
      )}
      {!ready && journey.appointmentId ? <AppointmentId id={journey.appointmentId} /> : null}
      {ready && rx ? (
        <>
          <VisitReferenceIds
            appointmentId={journey.appointmentId}
            prescriptionId={rx.id}
            trackingId={rx.trackingId}
            prominent
          />
          <ul className="meds">
            {rx.medications.map((m, i) => (
              <li key={`${m.name}-${i}`}>
                <strong>{m.name}</strong> — {m.dosage}, {m.frequency}
                {m.duration ? `, ${m.duration}` : ""}
              </li>
            ))}
          </ul>

          {choosePharmacy && pharmacies.length > 0 ? (
            <div className="pharmacy-choice-panel">
              <h3>Choose a pharmacy</h3>
              {recommendReason ? <p className="sub hint">{recommendReason}</p> : null}
              <label className="pharmacy-select-label" htmlFor="pharmacy-select">
                Pharmacy
              </label>
              <select
                id="pharmacy-select"
                className="pharmacy-select"
                value={selectedPharmacyId ?? ""}
                onChange={(e) => setSelectedPharmacyId(e.target.value)}
                aria-label="Choose a pharmacy"
              >
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {pharmacyOptionLabel(p, recommendedId)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => setStep("myCare")}>
          Back to My care
        </button>
        {choosePharmacy ? (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={routingBusy}
              onClick={() => void skipPharmacyOrder()}
            >
              Finish without pharmacy order
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedPharmacyId || routingBusy}
              onClick={() => void placeOrder()}
            >
              Place order at pharmacy
            </button>
          </>
        ) : declined ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep("complete")}>
            Finish visit
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!routed || !rx}
            onClick={() => setStep("delivery")}
          >
            Track medicine delivery
          </button>
        )}
      </div>
    </section>
  );
}
