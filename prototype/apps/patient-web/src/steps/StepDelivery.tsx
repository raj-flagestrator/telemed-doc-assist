import { useEffect, useState } from "react";
import { api } from "../api";
import { ConfirmDeliveryReceived } from "../components/ConfirmDeliveryReceived";
import { VisitReferenceIds } from "../components/VisitReferenceIds";
import { useApp } from "../context/AppContext";

interface TrackingStep {
  label: string;
  at: string;
  completed: boolean;
}

export function StepDelivery() {
  const { token, journey, setStep, updateJourney, setError, clearError, error } = useApp();
  const [status, setStatus] = useState("");
  const [steps, setSteps] = useState<TrackingStep[]>([]);
  const [eta, setEta] = useState<number | null>(null);
  const [deliveryId, setDeliveryId] = useState<string | undefined>(journey.deliveryId);
  const [rxComplete, setRxComplete] = useState(false);

  useEffect(() => {
    if (!token || !journey.prescriptionId) return;

    async function load() {
      try {
        clearError();
        let id = journey.deliveryId;
        if (!id) {
          const created = await api.createDelivery(token!, journey.prescriptionId!);
          id = created.deliveryId;
          updateJourney({ deliveryId: id });
        }
        setDeliveryId(id);
        const d = (await api.getDelivery(token!, id!)) as {
          status: string;
          trackingSteps: TrackingStep[];
          etaMinutes: number;
        };
        setStatus(d.status);
        setSteps(d.trackingSteps);
        setEta(d.etaMinutes);
        if (d.status === "delivered") {
          setRxComplete(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delivery load failed");
      }
    }
    void load();
  }, [token, journey.prescriptionId, journey.deliveryId, updateJourney, setError, clearError]);

  function onConfirmed() {
    setStatus("delivered");
    setRxComplete(true);
    setSteps((prev) => prev.map((s) => ({ ...s, completed: true })));
  }

  return (
    <section className="card">
      <h2>Medicine delivery</h2>
      <p className="sub">
        {journey.pharmacyName
          ? `From ${journey.pharmacyName} to your island`
          : "Medicine delivery"}{" "}
        — GPS-tracked (prototype).
      </p>
      <VisitReferenceIds
        appointmentId={journey.appointmentId}
        prescriptionId={journey.prescriptionId}
        trackingId={journey.trackingId}
        prominent
      />
      {error ? <p className="alert">{error}</p> : null}
      <p>
        Status: <span className="badge">{status || "loading"}</span>
        {eta ? ` · ETA ~${eta} min` : null}
      </p>
      <ul className="timeline">
        {steps.map((s) => (
          <li key={s.label} className={s.completed ? "done" : ""}>
            <span className="dot" />
            <span>
              {s.label}
              {s.completed ? ` · ${new Date(s.at).toLocaleTimeString()}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {token && deliveryId ? (
        <ConfirmDeliveryReceived
          token={token}
          deliveryId={deliveryId}
          alreadyComplete={rxComplete}
          onConfirmed={onConfirmed}
          onError={setError}
        />
      ) : null}
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => setStep("myCare")}>
          Back to My care
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setStep("complete")}>
          View health summary
        </button>
      </div>
    </section>
  );
}
