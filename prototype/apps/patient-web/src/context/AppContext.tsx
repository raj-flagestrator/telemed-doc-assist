import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type CareVisit, type TenantConfig } from "../api";

export type JourneyStep =
  | "login"
  | "myCare"
  | "careDetail"
  | "profile"
  | "triage"
  | "booking"
  | "consult"
  | "prescription"
  | "delivery"
  | "complete";

interface JourneyState {
  phone: string;
  appointmentId?: string;
  consultationId?: string;
  prescriptionId?: string;
  trackingId?: string;
  pharmacyName?: string;
  routingReason?: string;
  deliveryId?: string;
  triageSpecialty?: string;
}

interface AppContextValue {
  config: TenantConfig | null;
  token: string | null;
  step: JourneyStep;
  journey: JourneyState;
  selectedCareVisit: CareVisit | null;
  loading: boolean;
  error: string | null;
  setStep: (s: JourneyStep) => void;
  setToken: (t: string | null) => void;
  updateJourney: (patch: Partial<JourneyState>) => void;
  setSelectedCareVisit: (visit: CareVisit | null) => void;
  clearError: () => void;
  setError: (e: string) => void;
  signOut: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const TOKEN_KEY = "medisphere_token";
const JOURNEY_KEY = "medisphere_journey";

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY)
  );
  const [step, setStep] = useState<JourneyStep>(() =>
    localStorage.getItem(TOKEN_KEY) ? "myCare" : "login"
  );
  const [journey, setJourney] = useState<JourneyState>(() => {
    try {
      return JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? "{}");
    } catch {
      return { phone: "" };
    }
  });
  const [selectedCareVisit, setSelectedCareVisit] = useState<CareVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        document.documentElement.style.setProperty("--primary", c.primaryColor);
        document.documentElement.style.setProperty("--secondary", c.secondaryColor);
      })
      .catch(() => setError("Could not load tenant configuration"))
      .finally(() => setLoading(false));
  }, []);

  const setToken = useCallback((t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  const updateJourney = useCallback((patch: Partial<JourneyState>) => {
    setJourney((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(JOURNEY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const setErrorStable = useCallback((e: string) => setError(e), []);

  const signOut = useCallback(() => {
    setToken(null);
    setJourney({ phone: "" });
    setSelectedCareVisit(null);
    localStorage.removeItem(JOURNEY_KEY);
    setStep("login");
    setError(null);
  }, [setToken]);

  const value = useMemo(
    () => ({
      config,
      token,
      step,
      journey,
      selectedCareVisit,
      loading,
      error,
      setStep,
      setToken,
      updateJourney,
      setSelectedCareVisit,
      clearError,
      setError: setErrorStable,
      signOut,
    }),
    [
      config,
      token,
      step,
      journey,
      selectedCareVisit,
      loading,
      error,
      setToken,
      updateJourney,
      clearError,
      setErrorStable,
      signOut,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
