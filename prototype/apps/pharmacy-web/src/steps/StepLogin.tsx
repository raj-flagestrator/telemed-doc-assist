import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { mergePharmacyAccounts, PROTOTYPE_PHARMACY_ACCOUNTS, type PrototypePharmacyAccount } from "../lib/accounts";

export function StepLogin() {
  const { setToken, setStaffInfo, setStep, setError, clearError, error } = useApp();
  const [accounts, setAccounts] = useState<PrototypePharmacyAccount[]>(PROTOTYPE_PHARMACY_ACCOUNTS);
  const [email, setEmail] = useState(PROTOTYPE_PHARMACY_ACCOUNTS[0].email);
  const [code, setCode] = useState("123456");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getAccounts()
      .then((res) => setAccounts(mergePharmacyAccounts(res.accounts ?? [])))
      .catch(() => setAccounts(PROTOTYPE_PHARMACY_ACCOUNTS));
  }, []);

  const selected = accounts.find((a) => a.email === email) ?? accounts[0];

  async function sendOtp() {
    clearError();
    setBusy(true);
    try {
      await api.requestOtp(email);
      setOtpSent(true);
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
      const res = await api.verifyOtp(email, code);
      setToken(res.accessToken);
      setStaffInfo(res.displayName, res.pharmacyName);
      setStep("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid OTP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Pharmacy sign in</h2>
      <p className="sub">Select your pharmacy account to manage orders and stock.</p>
      {error && <div className="alert">{error}</div>}
      <label htmlFor="email">Staff account</label>
      <select
        id="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setOtpSent(false);
        }}
        disabled={busy}
      >
        {accounts.map((a) => (
          <option key={a.email} value={a.email}>
            {a.name} · {a.role} ({a.email})
          </option>
        ))}
      </select>
      {selected && <p className="sub hint">{selected.pharmacyName}</p>}
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
