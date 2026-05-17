import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

export function StepProfile() {
  const { token, journey, setToken, setStep, setError, clearError, error } = useApp();
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [insuranceId, setInsuranceId] = useState("");
  const [island, setIsland] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .getPatientMe(token)
      .then((me) => {
        setFullName(me.fullName ?? "");
        setNationalId(me.nationalId ?? "");
        setInsuranceId(me.insuranceId ?? "");
        setIsland(me.island ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    clearError();
    setBusy(true);
    const payload = {
      fullName,
      phone: journey.phone,
      nationalId,
      insuranceId,
      island,
    };
    try {
      const res = await api.saveProfile(token, payload);
      setToken(res.accessToken);
      setStep("triage");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <h2>Complete profile</h2>
        <p className="sub">Loading your details…</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Complete profile</h2>
      <p className="sub">National ID and insurance linking (prototype adapters).</p>
      <button type="button" className="btn btn-secondary btn-inline-top" onClick={() => setStep("myCare")}>
        View my care history
      </button>
      {error && <div className="alert">{error}</div>}
      <form onSubmit={submit}>
        <label htmlFor="name">Full name</label>
        <input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <label htmlFor="nid">National ID</label>
        <input id="nid" value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="A123456" />
        <label htmlFor="ins">Insurance ID</label>
        <input id="ins" value={insuranceId} onChange={(e) => setInsuranceId(e.target.value)} placeholder="AXA-2026-001" />
        <label htmlFor="island">Island</label>
        <input
          id="island"
          required
          value={island}
          onChange={(e) => setIsland(e.target.value)}
          placeholder="e.g. Thaa Atoll — Remote Island"
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Save & continue
        </button>
      </form>
    </section>
  );
}
