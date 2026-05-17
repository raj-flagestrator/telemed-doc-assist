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

export type PharmacyStep = "login" | "dashboard" | "profile" | "order" | "done";

interface AppContextValue {
  config: TenantConfig | null;
  token: string | null;
  staffName: string;
  pharmacyName: string;
  step: PharmacyStep;
  fulfillmentId: string | null;
  loading: boolean;
  error: string | null;
  setStep: (s: PharmacyStep) => void;
  setToken: (t: string | null) => void;
  setStaffInfo: (name: string, pharmacy: string) => void;
  setFulfillmentId: (id: string | null) => void;
  signOut: () => void;
  clearError: () => void;
  setError: (e: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const TOKEN_KEY = "medisphere_pharmacy_token";
const STAFF_KEY = "medisphere_pharmacy_info";

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [staffName, setStaffName] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STAFF_KEY) ?? "{}").name ?? "";
    } catch {
      return "";
    }
  });
  const [pharmacyName, setPharmacyName] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STAFF_KEY) ?? "{}").pharmacyName ?? "";
    } catch {
      return "";
    }
  });
  const [step, setStep] = useState<PharmacyStep>(token ? "dashboard" : "login");
  const [fulfillmentId, setFulfillmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        document.documentElement.style.setProperty("--primary", "#059669");
        document.documentElement.style.setProperty("--secondary", "#047857");
      })
      .catch(() => setError("Could not load tenant configuration"))
      .finally(() => setLoading(false));
  }, []);

  const setToken = useCallback((t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  const setStaffInfo = useCallback((name: string, pharmacy: string) => {
    setStaffName(name);
    setPharmacyName(pharmacy);
    localStorage.setItem(STAFF_KEY, JSON.stringify({ name, pharmacyName: pharmacy }));
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setFulfillmentId(null);
    setStep("login");
    setError(null);
    localStorage.removeItem(STAFF_KEY);
    setStaffName("");
    setPharmacyName("");
  }, [setToken]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      config,
      token,
      staffName,
      pharmacyName,
      step,
      fulfillmentId,
      loading,
      error,
      setStep,
      setToken,
      setStaffInfo,
      setFulfillmentId,
      signOut,
      clearError,
      setError,
    }),
    [
      config,
      token,
      staffName,
      pharmacyName,
      step,
      fulfillmentId,
      loading,
      error,
      setToken,
      setStaffInfo,
      signOut,
      clearError,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
