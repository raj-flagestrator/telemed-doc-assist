import { useEffect, useState } from "react";
import { api } from "../api";
import { AppointmentId } from "../components/AppointmentId";
import { useApp } from "../context/AppContext";

function bookingHint(specialty: string): string {
  const s = specialty.toLowerCase();
  if (s.includes("cardio")) return "Select a cardiologist slot — English consultation.";
  if (s.includes("ent")) return "Select an ENT specialist slot — English consultation.";
  if (s.includes("gastro")) return "Select a gastroenterology slot — English consultation.";
  if (s.includes("general") || s === "gp") return "Select a GP slot — English consultation.";
  return `Select a ${specialty} slot — English consultation.`;
}

export function StepBooking() {
  const { token, journey, setStep, updateJourney, setError, clearError, error } = useApp();
  const [slots, setSlots] = useState<Array<Record<string, string>>>([]);
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const specialty = journey.triageSpecialty ?? "Cardiology";

  useEffect(() => {
    if (!token) return;
    api
      .getSlots(token, specialty)
      .then((r) => setSlots(r.slots))
      .catch((e) => setError(e.message));
  }, [token, journey.triageSpecialty, setError]);

  async function book() {
    if (!token || !selected) return;
    clearError();
    setBusy(true);
    try {
      const res = await api.bookAppointment(token, selected);
      updateJourney({ appointmentId: res.appointmentId });
      setStep("consult");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Book appointment</h2>
      <p className="sub">{bookingHint(specialty)}</p>
      <AppointmentId id={journey.appointmentId} />
      {error ? <p className="alert">{error}</p> : null}
      {slots.map((slot) => (
        <div
          key={slot.id}
          className={`slot-card ${selected?.id === slot.id ? "selected" : ""}`}
          onClick={() => setSelected(slot)}
          role="button"
          tabIndex={0}
        >
          <strong>{slot.practitionerName}</strong>
          <p>{slot.specialty}</p>
          <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            {new Date(slot.startAt).toLocaleString()}
          </p>
        </div>
      ))}
      <button type="button" className="btn btn-primary" disabled={!selected || busy} onClick={book}>
        Confirm booking
      </button>
    </section>
  );
}
