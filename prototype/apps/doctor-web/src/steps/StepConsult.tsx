import { useState } from "react";
import { api } from "../api";
import { AppointmentId } from "../components/AppointmentId";
import { useApp } from "../context/AppContext";

export function StepConsult() {
  const { token, visit, setVisit, setStep, setError, clearError, error } = useApp();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [consultationId, setConsultationId] = useState<string | null>(visit.consultationId ?? null);
  const [notes, setNotes] = useState(
    visit.notes ?? "Teleconsult — vitals stable, continue current plan."
  );
  const [phase, setPhase] = useState<"idle" | "live">("idle");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!token || !visit.appointmentId) return;
    clearError();
    setBusy(true);
    try {
      const created = await api.startConsultation(token, visit.appointmentId);
      setConsultationId(created.consultationId);
      setRoomId(created.roomId);
      setVisit({ consultationId: created.consultationId });
      await api.joinConsultation(token, created.consultationId);
      setPhase("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start consultation");
    } finally {
      setBusy(false);
    }
  }

  function endCall() {
    if (!consultationId) return;
    setVisit({ consultationId, notes });
    setStep("prescribe");
  }

  return (
    <section className="card">
      <h2>Video consultation</h2>
      <p className="sub">With {visit.patientName ?? "patient"} · WebRTC-ready prototype UI</p>
      <AppointmentId id={visit.appointmentId} />
      {error && <div className="alert">{error}</div>}
      {phase === "idle" && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>
          Open consult room
        </button>
      )}
      {phase === "live" && (
        <>
          <div className="video-mock">
            Live · Room {roomId?.slice(0, 12)}…
            <br />
            <small>Clinical notes captured on next step</small>
          </div>
          <label htmlFor="notes">Consultation notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={() => setStep("visit")}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={endCall}>
              End call & prescribe
            </button>
          </div>
        </>
      )}
    </section>
  );
}
