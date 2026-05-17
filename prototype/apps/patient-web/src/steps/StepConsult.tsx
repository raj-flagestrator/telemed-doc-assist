import { useState } from "react";
import { api } from "../api";
import { AppointmentId } from "../components/AppointmentId";
import { useApp } from "../context/AppContext";

export function StepConsult() {
  const { token, journey, setStep, updateJourney, setError, clearError, error } = useApp();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "live" | "done">("idle");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!token || !journey.appointmentId) return;
    clearError();
    setBusy(true);
    try {
      const created = await api.startConsultation(token, journey.appointmentId);
      setConsultationId(created.consultationId);
      setRoomId(created.roomId);
      await api.joinConsultation(token, created.consultationId);
      updateJourney({ consultationId: created.consultationId });
      setPhase("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start consultation");
    } finally {
      setBusy(false);
    }
  }

  async function endCall() {
    if (!token || !consultationId) return;
    setBusy(true);
    try {
      await api.completeConsultation(token, consultationId);
      setPhase("done");
      setStep("prescription");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete consultation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Video consultation</h2>
      <p className="sub">Secure WebRTC session (prototype UI — TURN-ready backend).</p>
      <AppointmentId id={journey.appointmentId} />
      {error ? <p className="alert">{error}</p> : null}
      {phase === "idle" && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>
          Join consultation room
        </button>
      )}
      {phase === "live" && (
        <>
          <div className="video-mock">
            Live consult · Room {roomId?.slice(0, 8)}…
            <br />
            <small>Audio-only fallback available</small>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={endCall}>
            End call & get prescription
          </button>
        </>
      )}
    </section>
  );
}
