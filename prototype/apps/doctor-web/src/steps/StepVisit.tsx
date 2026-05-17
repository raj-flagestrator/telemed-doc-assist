import { useEffect, useState } from "react";

import { api, type AppointmentDetail } from "../api";

import { useApp } from "../context/AppContext";

import { AppointmentId } from "../components/AppointmentId";
import { PrescriptionTrackingId } from "../components/PrescriptionTrackingId";
import { visitStatusClass, visitStatusLabel } from "../lib/visitStatus";



export function StepVisit() {

  const { token, visit, setVisit, setStep, setError, clearError, error } = useApp();

  const [detail, setDetail] = useState<AppointmentDetail | null>(null);

  const [busy, setBusy] = useState(true);



  useEffect(() => {

    if (!token || !visit.appointmentId) return;

    clearError();

    api

      .getAppointment(token, visit.appointmentId)

      .then((d) => {

        setDetail(d);

        if (d.consultation?.id) {

          setVisit({ consultationId: d.consultation.id, notes: d.consultation.notes ?? visit.notes });

        }

      })

      .catch((e) => setError(e instanceof Error ? e.message : "Could not load visit"))

      .finally(() => setBusy(false));

  }, [token, visit.appointmentId, clearError, setError, setVisit, visit.notes]);



  if (busy || !detail) {

    return (

      <section className="card">

        <h2>Patient visit</h2>

        <p className="sub">Loading chart…</p>

      </section>

    );

  }



  const triage = detail.triage;

  const result = (triage?.result ?? {}) as Record<string, unknown>;

  const statusKey = visit.visitStatus ?? detail.appointment.status ?? "booked";

  const isCompleted = statusKey === "completed";

  const diagnosis = detail.consultation?.notes?.trim();

  const rx = detail.prescription;

  const pharmacy = detail.delivery?.pharmacyName ?? rx?.pharmacyName ?? null;



  return (

    <section className="card">

      <h2>{detail.patient.fullName}</h2>

      <p className="sub">

        {detail.appointment.specialty} · {detail.appointment.language} · {detail.patient.island ?? "Island N/A"}

      </p>

      <p className="sub">

        Visit status:{" "}

        <span className={visitStatusClass(statusKey)}>{visitStatusLabel(statusKey)}</span>

      </p>

      <AppointmentId id={visit.appointmentId ?? detail.appointment.id} />

      {error && <div className="alert">{error}</div>}



      <div className="panel">

        <h3>Demographics</h3>

        <ul className="meds">

          <li>Phone: {detail.patient.phone}</li>

          <li>National ID: {detail.patient.nationalId ?? "—"}</li>

          <li>Insurance: {detail.patient.insuranceId ?? "—"}</li>

        </ul>

      </div>



      {isCompleted ? (

        <>

          <div className="panel panel-completed">

            <h3>Diagnosis & consultation notes</h3>

            <p className="notes-body">{diagnosis || "No consultation notes recorded."}</p>

            {detail.consultation?.completedAt ? (

              <p className="sub hint">Completed {new Date(detail.consultation.completedAt).toLocaleString()}</p>

            ) : null}

          </div>



          {rx ? (

            <div className="panel panel-completed">

              <h3>Prescription issued</h3>

              <PrescriptionTrackingId prescriptionId={rx.id} trackingId={rx.trackingId} prominent />

              <p className="sub">

                Status: <span className={visitStatusClass(rx.status)}>{visitStatusLabel(rx.status)}</span>

                {rx.signedAt ? ` · Signed ${new Date(rx.signedAt).toLocaleString()}` : ""}

              </p>

              <ul className="meds rx-detail-list">

                {rx.medications.map((m, i) => (

                  <li key={i}>

                    <strong>{m.name}</strong> — {m.dosage}, {m.frequency}, {m.duration}

                  </li>

                ))}

              </ul>

            </div>

          ) : (

            <p className="sub">No prescription on file for this visit.</p>

          )}



          <div className="panel panel-completed">

            <h3>Pharmacy</h3>

            {pharmacy ? (

              <>

                <p className="notes-body">{pharmacy}</p>

                {detail.delivery ? (

                  <p className="sub">

                    Delivery:{" "}

                    <span className={visitStatusClass(detail.delivery.status)}>

                      {visitStatusLabel(detail.delivery.status)}

                    </span>

                    {detail.delivery.etaMinutes ? ` · ETA ~${detail.delivery.etaMinutes} min` : ""}

                  </p>

                ) : (

                  <p className="sub hint">Prescription signed; patient may request island delivery separately.</p>

                )}

              </>

            ) : (

              <p className="sub">Pharmacy routing not recorded.</p>

            )}

          </div>

        </>

      ) : (

        <>

          {triage ? (

            <div className="panel">

              <h3>AI triage summary</h3>

              <p className="sub">Symptoms: {(triage.symptoms as string[]).join(", ")}</p>

              <ul className="meds">

                <li>Risk: {String(result.riskLevel ?? "—")} (score {String(result.riskScore ?? "—")})</li>

                <li>Recommended: {String(result.recommendedSpecialty ?? "—")}</li>

                <li>{String(result.recommendedAction ?? "")}</li>

              </ul>

            </div>

          ) : (

            <p className="sub">No triage assessment on file.</p>

          )}



          <div className="btn-row">

            <button type="button" className="btn btn-secondary" onClick={() => setStep("dashboard")}>

              Back

            </button>

            <button type="button" className="btn btn-primary" onClick={() => setStep("consult")}>

              Start video consult

            </button>

          </div>

        </>

      )}



      {isCompleted && (

        <button type="button" className="btn btn-primary" onClick={() => setStep("dashboard")}>

          Back to schedule

        </button>

      )}

    </section>

  );

}


