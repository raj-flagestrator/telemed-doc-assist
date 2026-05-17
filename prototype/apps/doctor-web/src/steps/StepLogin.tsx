import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { mergeDoctorLists, PROTOTYPE_DOCTORS, type PrototypeDoctor } from "../lib/doctors";

export function StepLogin() {
  const { setToken, setDoctorInfo, setStep, setError, clearError, error } = useApp();
  const [doctors, setDoctors] = useState<PrototypeDoctor[]>(PROTOTYPE_DOCTORS);
  const [email, setEmail] = useState(PROTOTYPE_DOCTORS[0].email);
  const [code, setCode] = useState("123456");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getDoctorAccounts()
      .then((res) => {
        const merged = mergeDoctorLists(res.doctors ?? []);
        setDoctors(merged);
        setEmail((current) =>
          merged.some((d) => d.email === current) ? current : merged[0].email
        );
      })
      .catch(() => {
        setDoctors(PROTOTYPE_DOCTORS);
      });
  }, []);

  const selected = doctors.find((d) => d.email === email) ?? doctors[0];

  async function sendOtp() {
    clearError();
    setBusy(true);
    try {
      await api.requestOtp(email);
      setOtpSent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send OTP";
      if (msg.includes("Doctor account not found") || msg.includes("Not Found")) {
        setError(
          "Backend is out of date — restart with: python scripts/run_all.py (from the prototype folder)"
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    clearError();
    setBusy(true);
    try {
      const res = await api.verifyOtp(email, code);
      setToken(res.accessToken);
      setDoctorInfo(res.displayName, res.specialty);
      setStep("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid OTP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Doctor sign in</h2>
      <p className="sub">Select your account to access the clinical workspace.</p>
      {error && <div className="alert">{error}</div>}
      <label htmlFor="email">Work email</label>
      <select
        id="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setOtpSent(false);
        }}
        disabled={busy}
      >
        {doctors.map((d) => (
          <option key={d.email} value={d.email}>
            {d.name} · {d.specialty} ({d.email})
          </option>
        ))}
      </select>
      {selected && (
        <p className="sub hint">Signing in as {selected.name} — {selected.specialty}</p>
      )}
      {!otpSent ? (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={sendOtp}>
          Continue
        </button>
      ) : (
        <>
          <label htmlFor="code">Verification code</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={verify}>
            Sign in
          </button>
        </>
      )}
    </section>
  );
}
