export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const API = API_BASE_URL;

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(init?.token), ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const body = err as { error?: string; detail?: string | Array<{ msg?: string }> };
    if (body.error) throw new Error(body.error);
    if (typeof body.detail === "string") {
      if (body.detail === "Not Found") {
        const err = new Error(
          `API not found (${path}) — restart backends from the prototype folder: python scripts/run_all.py`
        );
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      throw new Error(body.detail);
    }
    if (Array.isArray(body.detail) && body.detail[0]?.msg) throw new Error(body.detail[0].msg);
    throw new Error("Request failed");
  }
  return res.json() as Promise<T>;
}

export interface TenantConfig {
  tenantId: string;
  name: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface MedicationLine {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface ScheduleAppointment {
  id: string;
  patientId: string;
  specialty: string;
  language: string;
  startAt: string;
  endAt: string;
  status: string;
  visitStatus?: string;
  patient: {
    fullName: string;
    phone: string;
    island?: string | null;
    nationalId?: string | null;
    insuranceId?: string | null;
  };
  consultation?: {
    id: string;
    status: string;
    roomId?: string;
    notes?: string | null;
    completedAt?: string | null;
  } | null;
  prescription?: {
    id: string;
    trackingId?: string;
    medications: MedicationLine[];
    status: string;
    signedAt?: string;
    pharmacyName?: string;
  } | null;
  delivery?: {
    id: string;
    status: string;
    pharmacyName: string;
    etaMinutes?: number | null;
  } | null;
  triage?: {
    symptoms: string[];
    result: Record<string, unknown>;
  } | null;
}

export interface AppointmentDetail {
  appointment: Record<string, string>;
  patient: ScheduleAppointment["patient"];
  consultation: ScheduleAppointment["consultation"];
  triage: ScheduleAppointment["triage"];
  prescription: ScheduleAppointment["prescription"];
  delivery: ScheduleAppointment["delivery"];
}

export const api = {
  getConfig: () => request<TenantConfig>("/api/v1/config"),
  getDoctorAccounts: () =>
    request<{ doctors: Array<{ email: string; name: string; specialty: string; practitionerId: string }> }>(
      "/api/v1/doctor/accounts"
    ),
  requestOtp: (email: string) =>
    request("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ email }) }),
  verifyOtp: (email: string, code: string) =>
    request<{
      accessToken: string;
      displayName: string;
      practitionerId: string;
      specialty: string;
    }>("/api/v1/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),
  getMe: (token: string) =>
    request<{ displayName: string; practitionerId: string }>("/api/v1/me", { token }),
  getSchedule: (token: string) =>
    request<{ appointments: ScheduleAppointment[] }>("/api/v1/schedule", { token }),
  getAppointment: (token: string, id: string) =>
    request<AppointmentDetail>(`/api/v1/appointments/${id}`, { token }),
  startConsultation: (token: string, appointmentId: string) =>
    request<{ consultationId: string; roomId: string }>("/api/v1/consultations/start", {
      method: "POST",
      token,
      body: JSON.stringify({ appointmentId }),
    }),
  joinConsultation: (token: string, consultationId: string) =>
    request("/api/v1/consultations/" + consultationId + "/join", { method: "POST", token }),
  completeConsultation: (token: string, consultationId: string, notes: string) =>
    request("/api/v1/consultations/" + consultationId + "/complete", {
      method: "POST",
      token,
      body: JSON.stringify({ notes }),
    }),
  recommendPrescription: (
    token: string,
    body: {
      symptoms: string[];
      riskLevel?: string;
      specialty?: string;
      consultationNotes?: string;
    }
  ) =>
    request<{ medications: MedicationLine[]; rationale: string; aiRecommended: boolean }>(
      "/api/v1/prescriptions/recommend",
      { method: "POST", token, body: JSON.stringify(body) }
    ),
  issuePrescription: (
    token: string,
    consultationId: string,
    medications: MedicationLine[],
    appointmentId?: string
  ) =>
    request<{
      prescriptionId: string;
      trackingId?: string;
      pharmacyName?: string;
      routingReason?: string;
      medications: MedicationLine[];
    }>(
      "/api/v1/prescriptions",
      {
        method: "POST",
        token,
        body: JSON.stringify({ consultationId, medications, appointmentId }),
      }
    ),
  getNotifications: (token: string) =>
    request<{ notifications: PharmacyNotification[] }>("/api/v1/notifications", { token }),
  dismissNotification: (token: string, notificationId: string) =>
    request<{ ok: boolean }>(`/api/v1/notifications/${encodeURIComponent(notificationId)}/dismiss`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    }),
  dismissAllNotifications: (token: string) =>
    request<{ ok: boolean }>("/api/v1/notifications/dismiss-all", {
      method: "POST",
      token,
      body: JSON.stringify({}),
    }),
  getPharmacies: (token: string) =>
    request<{ pharmacies: PharmacyOption[] }>("/api/v1/pharmacies", { token }),
  overridePharmacy: (token: string, prescriptionId: string, pharmacyId: string) =>
    request<{ pharmacyId: string; pharmacyName: string; routingHistory: RoutingEvent[] }>(
      `/api/v1/prescriptions/${prescriptionId}/pharmacy-override`,
      { method: "POST", token, body: JSON.stringify({ pharmacyId }) }
    ),
  getCopilotInfo: (token: string) =>
    request<{ configured: boolean; model?: string; error?: string }>("/api/v1/copilot/info", {
      token,
    }),
};

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

export type CopilotStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; stopReason?: string; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string };

export async function streamCopilotChat(
  token: string,
  body: { appointmentId?: string; messages: CopilotMessage[]; extraInstructions?: string },
  onEvent: (event: CopilotStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/copilot/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Copilot HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!raw.startsWith("data:")) continue;
      const json = raw.slice(5).trim();
      if (!json) continue;
      try {
        onEvent(JSON.parse(json) as CopilotStreamEvent);
      } catch {
        // ignore malformed frame
      }
    }
  }
}

export interface RoutingEvent {
  at: string;
  type: string;
  pharmacyId: string;
  pharmacyName: string;
  reason: string;
  routingMode: string;
  fromPharmacyId?: string;
  shortageMedications?: string[];
  policy?: string;
}

export interface PharmacyNotification {
  id: string;
  prescriptionId: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface PharmacyOption {
  id: string;
  name: string;
  location: string;
  type: string;
  isHub: boolean;
}
