import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";

export function StepProfile() {
  const { staffName, pharmacyName, setStaffInfo, setStep, clearError, error, setError } = useApp();
  const [name, setName] = useState(staffName);
  const [pharmacy, setPharmacy] = useState(pharmacyName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(staffName);
    setPharmacy(pharmacyName);
  }, [staffName, pharmacyName]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      setStaffInfo(name.trim() || staffName, pharmacy.trim() || pharmacyName);
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
        ← Back to operations
      </button>
      <h2>Profile</h2>
      <p className="sub">Update your staff display name and pharmacy.</p>
      {error && <div className="alert">{error}</div>}
      <form onSubmit={submit}>
        <label htmlFor="staff-name">Your name</label>
        <input id="staff-name" required value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="pharmacy-name">Pharmacy</label>
        <input id="pharmacy-name" value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </section>
  );
}
