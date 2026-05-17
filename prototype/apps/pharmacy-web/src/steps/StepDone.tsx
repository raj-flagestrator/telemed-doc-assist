import { useApp } from "../context/AppContext";

export function StepDone() {
  const { setStep, setFulfillmentId } = useApp();

  return (
    <section className="card">
      <h2>Dispatched</h2>
      <p className="sub">
        Medicines are with the courier. The patient can track delivery in the patient app under
        medicine delivery.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setFulfillmentId(null);
          setStep("dashboard");
        }}
      >
        Back to prescription queue
      </button>
    </section>
  );
}
