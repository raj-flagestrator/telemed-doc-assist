import { AppointmentId } from "../components/AppointmentId";

import { PrescriptionTrackingId } from "../components/PrescriptionTrackingId";

import { useApp } from "../context/AppContext";



export function StepDone() {

  const { visit, setStep, setVisit } = useApp();



  function backToSchedule() {

    setVisit({});

    setStep("dashboard");

  }



  return (

    <section className="card">

      <h2>Visit complete</h2>

      <p className="sub">

        Consultation closed and ePrescription issued for {visit.patientName ?? "the patient"}. The

        patient will review the prescription in their app, choose a pharmacy to place an order, or

        finish the visit without ordering.

      </p>

      <AppointmentId id={visit.appointmentId} />

      <PrescriptionTrackingId

        prescriptionId={visit.prescriptionId}

        trackingId={visit.trackingId}

        prominent

      />

      <ul className="meds">

        <li>Consultation marked completed</li>

        <li>Digitally signed prescription sent to the patient for pharmacy selection</li>

        <li>Pharmacy receives the order only after the patient places it</li>

      </ul>

      <button type="button" className="btn btn-primary" onClick={backToSchedule}>

        Back to schedule

      </button>

    </section>

  );

}

