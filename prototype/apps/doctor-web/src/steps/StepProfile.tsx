import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

export function StepProfile() {
  const { token, doctorName, specialty, setDoctorInfo, setStep, setError, clearError, error } = useApp();
  const [name, setName] = useState(doctorName);
  const [spec, setSpec] = useState(specialty);
  const [practitionerId, setPractitionerId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(doctorName);
    setSpec(specialty);
  }, [doctorName, specialty]);

  useEffect(() => {
    if (!token) return;
    api
      .getMe(token)
      .then((me) => setPractitionerId(me.practitionerId ?? ""))
      .catch(() => setPractitionerId(""));
  }, [token]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      setDoctorInfo(name.trim() || doctorName, spec.trim() || specialty);
      setStep("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <button type="button" className="btn-text btn-back" onClick={() => setStep("dashboard")}>
        ← Back to schedule
      </button>
      <h2>Profile</h2>
      <p className="sub">Update how your name and specialty appear in the portal.</p>
      {error && <div className="alert">{error}</div>}
      <form onSubmit={submit}>
        <label htmlFor="doc-name">Display name</label>
        <input id="doc-name" required value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="doc-spec">Specialty</label>
        <input id="doc-spec" value={spec} onChange={(e) => setSpec(e.target.value)} />
        {practitionerId ? (
          <p className="sub hint">Practitioner ID: {practitionerId}</p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </section>
  );
}
