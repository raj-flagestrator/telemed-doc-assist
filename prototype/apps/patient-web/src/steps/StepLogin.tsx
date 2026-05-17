import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

export function StepLogin() {
  const { setToken, setStep, updateJourney, setError, clearError, error } = useApp();
  const [phone, setPhone] = useState("+9607712345");
  const [code, setCode] = useState("123456");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    clearError();
    setBusy(true);
    try {
      await api.requestOtp(phone);
      setOtpSent(true);
      updateJourney({ phone });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    clearError();
    setBusy(true);
    try {
      const res = await api.verifyOtp(phone, code);
      setToken(res.accessToken);
      updateJourney({ phone });
      setStep(res.patientId ? "myCare" : "profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid OTP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Sign in</h2>
      <p className="sub">Mobile OTP registration for remote island patients.</p>
      {error && <div className="alert">{error}</div>}
      <label htmlFor="phone">Mobile number</label>
      <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      {!otpSent ? (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={sendOtp}>
          Send OTP
        </button>
      ) : (
        <>
          <label htmlFor="code">OTP</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={verify}>
            Verify & continue
          </button>
        </>
      )}
    </section>
  );
}
