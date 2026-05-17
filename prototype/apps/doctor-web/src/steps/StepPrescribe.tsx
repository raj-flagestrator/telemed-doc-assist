import { useEffect, useState } from "react";
import { api, type MedicationLine } from "../api";
import { useApp } from "../context/AppContext";
import { AppointmentId } from "../components/AppointmentId";
import { recommendMedicationsLocal } from "../lib/prescriptionRecommend";

function PencilIcon() {
  return (
    <svg className="icon-pencil" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-2.207 4.207L5 14.172V16h1.828l6.172-6.172-2.828-2.828z" />
    </svg>
  );
}

export function StepPrescribe() {
  const { token, visit, setVisit, setStep, setError, clearError, error } = useApp();
  const [busy, setBusy] = useState(false);
  const [loadingRx, setLoadingRx] = useState(true);
  const [rationale, setRationale] = useState("");
  const [meds, setMeds] = useState<MedicationLine[]>([]);
  const [notes, setNotes] = useState(visit.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);

  useEffect(() => {
    if (!token) return;
    clearError();
    setLoadingRx(true);
    api
      .recommendPrescription(token, {
        symptoms: visit.triageSymptoms ?? [],
        riskLevel: visit.triageRiskLevel,
        specialty: visit.specialty,
        consultationNotes: visit.notes,
      })
      .then((data) => {
        setMeds(data.medications);
        setRationale(data.rationale);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "";
        const is404 = msg.includes("API not found") || (e as Error & { status?: number }).status === 404;
        if (is404) {
          const local = recommendMedicationsLocal({
            symptoms: visit.triageSymptoms ?? [],
            riskLevel: visit.triageRiskLevel,
            specialty: visit.specialty,
            consultationNotes: visit.notes,
          });
          setMeds(local.medications);
          setRationale(local.rationale);
          return;
        }
        setError(msg || "Could not load AI recommendation");
      })
      .finally(() => setLoadingRx(false));
  }, [token, visit.triageSymptoms, visit.triageRiskLevel, visit.specialty, visit.notes, clearError, setError]);

  function updateMed(index: number, field: keyof MedicationLine, value: string) {
    setMeds((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  function addMed() {
    setMeds((prev) => [
      ...prev,
      { name: "", dosage: "", frequency: "", duration: "" },
    ]);
  }

  function removeMed(index: number) {
    setMeds((prev) => prev.filter((_, i) => i !== index));
  }

  function saveNotes() {
    setVisit({ notes });
    setEditingNotes(false);
  }

  async function signAndIssue() {
    if (!token || !visit.consultationId || meds.length === 0) return;
    clearError();
    setBusy(true);
    try {
      const finalNotes = notes.trim();
      if (finalNotes) {
        await api.completeConsultation(token, visit.consultationId, finalNotes);
        setVisit({ notes: finalNotes });
      }
      const issued = await api.issuePrescription(
        token,
        visit.consultationId,
        meds,
        visit.appointmentId
      );
      setVisit({
        prescriptionId: issued.prescriptionId,
        trackingId: issued.trackingId,
      });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue prescription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Digital prescription</h2>
      <p className="sub">AI-suggested regimen — review and edit before signing.</p>
      <AppointmentId id={visit.appointmentId} />
      {error && <div className="alert">{error}</div>}

      <div className="panel notes-panel">
        <div className="panel-head">
          <div>
            <h3>Consultation notes</h3>
            <p className="sub hint">
              From your video consult step (editable here before signing). Not from patient triage chat.
            </p>
          </div>
          {!editingNotes ? (
            <button
              type="button"
              className="btn-icon"
              title="Edit or append notes"
              aria-label="Edit consultation notes"
              onClick={() => setEditingNotes(true)}
            >
              <PencilIcon />
            </button>
          ) : null}
        </div>
        {editingNotes ? (
          <>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Clinical notes from the consultation…"
            />
            <div className="btn-row inline-row">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingNotes(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveNotes}>
                Save notes
              </button>
            </div>
          </>
        ) : (
          <p className="notes-body">{notes.trim() || "No notes yet — use the pencil to add before signing."}</p>
        )}
      </div>

      {loadingRx ? (
        <p className="sub">Generating AI recommendation…</p>
      ) : (
        <>
          {rationale ? <p className="sub ai-rationale">{rationale}</p> : null}
          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meds.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={m.name}
                        onChange={(e) => updateMed(i, "name", e.target.value)}
                        aria-label={`Medication ${i + 1} name`}
                      />
                    </td>
                    <td>
                      <input
                        value={m.dosage}
                        onChange={(e) => updateMed(i, "dosage", e.target.value)}
                        aria-label={`Medication ${i + 1} dosage`}
                      />
                    </td>
                    <td>
                      <input
                        value={m.frequency}
                        onChange={(e) => updateMed(i, "frequency", e.target.value)}
                        aria-label={`Medication ${i + 1} frequency`}
                      />
                    </td>
                    <td>
                      <input
                        value={m.duration}
                        onChange={(e) => updateMed(i, "duration", e.target.value)}
                        aria-label={`Medication ${i + 1} duration`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => removeMed(i)}
                        disabled={meds.length <= 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary add-med" onClick={addMed}>
            Add medication
          </button>
        </>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => setStep("consult")}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || loadingRx || meds.length === 0}
          onClick={signAndIssue}
        >
          Sign ePrescription & finish
        </button>
      </div>
    </section>
  );
}
