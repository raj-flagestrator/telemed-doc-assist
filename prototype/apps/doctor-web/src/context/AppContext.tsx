import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type TenantConfig } from "../api";

export type DoctorStep = "login" | "dashboard" | "profile" | "visit" | "consult" | "prescribe" | "done";

export interface MedicationLine {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

interface VisitState {
  appointmentId?: string;
  consultationId?: string;
  prescriptionId?: string;
  trackingId?: string;
  pharmacyName?: string;
  routingReason?: string;
  patientName?: string;
  notes?: string;
  specialty?: string;
  triageSymptoms?: string[];
  triageRiskLevel?: string;
  visitStatus?: string;
}

interface AppContextValue {
  config: TenantConfig | null;
  token: string | null;
  doctorName: string;
  specialty: string;
  step: DoctorStep;
  visit: VisitState;
  loading: boolean;
  error: string | null;
  setStep: (s: DoctorStep) => void;
  setToken: (t: string | null) => void;
  setDoctorInfo: (name: string, specialty: string) => void;
  setVisit: (patch: Partial<VisitState>) => void;
  signOut: () => void;
  clearError: () => void;
  setError: (e: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const TOKEN_KEY = "medisphere_doctor_token";
const DOCTOR_KEY = "medisphere_doctor_info";

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [doctorName, setDoctorName] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DOCTOR_KEY) ?? "{}").name ?? "";
    } catch {
      return "";
    }
  });
  const [specialty, setSpecialty] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DOCTOR_KEY) ?? "{}").specialty ?? "";
    } catch {
      return "";
    }
  });
  const [step, setStep] = useState<DoctorStep>(token ? "dashboard" : "login");
  const [visit, setVisitState] = useState<VisitState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        document.documentElement.style.setProperty("--primary", "#4338ca");
        document.documentElement.style.setProperty("--secondary", "#3730a3");
      })
      .catch(() => setError("Could not load tenant configuration"))
      .finally(() => setLoading(false));
  }, []);

  const setToken = useCallback((t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  const setDoctorInfo = useCallback((name: string, spec: string) => {
    setDoctorName(name);
    setSpecialty(spec);
    localStorage.setItem(DOCTOR_KEY, JSON.stringify({ name, specialty: spec }));
  }, []);

  const setVisit = useCallback((patch: Partial<VisitState>) => {
    setVisitState((prev) => ({ ...prev, ...patch }));
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setVisitState({});
    setStep("login");
    setError(null);
    localStorage.removeItem(DOCTOR_KEY);
    setDoctorName("");
    setSpecialty("");
  }, [setToken]);

  const value = useMemo(
    () => ({
      config,
      token,
      doctorName,
      specialty,
      step,
      visit,
      loading,
      error,
      setStep,
      setToken,
      setDoctorInfo,
      setVisit,
      signOut,
      clearError: () => setError(null),
      setError,
    }),
    [config, token, doctorName, specialty, step, visit, loading, error, setToken, setDoctorInfo, setVisit, signOut]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
