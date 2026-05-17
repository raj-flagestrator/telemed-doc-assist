import { AppointmentId } from "../components/AppointmentId";
import { useApp } from "../context/AppContext";

export function StepComplete() {
  const { config, journey, setStep } = useApp();

  return (
    <section className="card">
      <h2>Care journey complete</h2>
      <p className="sub">
        You completed the full telemedicine pathway: registration → symptom assessment → specialist
        consultation → ePrescription → pharmacy fulfillment and delivery.
      </p>
      <AppointmentId id={journey.appointmentId} />
      <ul className="meds">
        <li>Remote island patient onboarded</li>
        <li>AI symptom screening with specialty referral (cardiology, ENT, gastro, or GP)</li>
        <li>Video consultation (WebRTC-ready)</li>
        <li>Digitally signed ePrescription</li>
        <li>Pharmacy fulfillment & delivery tracking</li>
      </ul>
      <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
        Next modules: doctor portal, pharmacy dashboard, government command center, Tele-ICU, RPM
        wearables — per {config?.name ?? "MediSphere AI"} roadmap.
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => setStep("myCare")}>
          View my care
        </button>
      </div>
    </section>
  );
}
