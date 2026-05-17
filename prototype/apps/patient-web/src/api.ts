const API = import.meta.env.VITE_API_BASE_URL ?? "";

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function isNotFoundResponse(body: { error?: string; detail?: string }): boolean {
  if (body.error?.includes("404") || body.error?.includes("Not Found")) return true;
  return body.detail === "Not Found";
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
      if (body.detail === "Method Not Allowed") {
        throw new Error("Backend needs a restart — run python scripts/run_all.py from the prototype folder.");
      }
      if (body.detail === "Not Found") {
        const err = new Error(`API not found (${path}) — restart backends: python scripts/run_all.py`);
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

async function requestOptional<T>(
  path: string,
  init?: RequestInit & { token?: string }
): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(init?.token), ...(init?.headers as Record<string, string>) },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const body = err as { error?: string; detail?: string };
    if (isNotFoundResponse(body)) return null;
    if (body.error) throw new Error(body.error);
    if (typeof body.detail === "string") throw new Error(body.detail);
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
  supportedLanguages: string[];
}

export interface PatientProfile {
  id?: string;
  fullName: string;
  phone: string;
  nationalId?: string | null;
  insuranceId?: string | null;
  island?: string | null;
}

export interface CareConsultation {
  id: string;
  appointmentId: string;
  status: string;
  notes?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface CareMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface CarePrescription {
  id: string;
  trackingId?: string;
  consultationId: string;
  appointmentId?: string;
  status: string;
  pharmacyId?: string;
  pharmacyName?: string;
  routingHistory?: RoutingEvent[];
  medications: CareMedication[];
  signedAt: string;
}

export interface CareDelivery {
  id: string;
  prescriptionId: string;
  status: string;
  pharmacyName: string;
  etaMinutes?: number | null;
}

export interface CareVisit {
  appointmentId: string;
  startAt: string;
  endAt: string;
  practitionerName: string;
  specialty: string;
  appointmentStatus: string;
  visitStatus?: string;
  consultation: CareConsultation | null;
  prescription: CarePrescription | null;
  delivery: CareDelivery | null;
}

export interface CareSummary {
  upcomingAppointments: CareVisit[];
  awaitingPrescription?: CareVisit[];
  pastVisits: CareVisit[];
  needsProfile?: boolean;
  staleBackend?: boolean;
}

export interface CareTriageAssessment {
  symptoms?: string[];
  result?: Record<string, unknown>;
}

export interface CareAppointmentDetail {
  appointment: {
    id: string;
    patientId: string;
    practitionerName: string;
    specialty: string;
    language: string;
    startAt: string;
    endAt: string;
    status: string;
  };
  visitStatus: string;
  consultation: CareConsultation | null;
  triage: CareTriageAssessment | null;
  prescription: (CarePrescription & { pharmacyName?: string }) | null;
  delivery: (CareDelivery & { trackingSteps?: Array<{ label: string; at: string; completed: boolean }> }) | null;
}

export const api = {
  getConfig: () => request<TenantConfig>("/api/v1/config"),
  requestOtp: (phone: string) =>
    request("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; patientId?: string }>("/api/v1/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),
  getPatientMe: (token: string) => request<PatientProfile>("/api/v1/patients/me", { token }),
  getCareSummary: (token: string) =>
    request<CareSummary>("/api/v1/care/summary", { token }),
  getCareAppointment: (token: string, appointmentId: string) =>
    request<CareAppointmentDetail>(`/api/v1/care/appointments/${appointmentId}`, { token }),
  getCareAppointmentOptional: (token: string, appointmentId: string) =>
    requestOptional<CareAppointmentDetail>(`/api/v1/care/appointments/${appointmentId}`, { token }),
  getPatientAppointments: (token: string) =>
    request<{ appointments: Array<Record<string, string>> }>("/api/v1/patient/appointments", { token }),
  getPatientConsultations: (token: string) =>
    request<{ consultations: CareConsultation[] }>("/api/v1/patient/consultations", { token }),
  getPatientPrescriptions: (token: string) =>
    request<{ prescriptions: CarePrescription[] }>("/api/v1/patient/prescriptions", { token }),
  getPatientDeliveries: (token: string) =>
    request<{ deliveries: CareDelivery[] }>("/api/v1/patient/deliveries", { token }),
  getPatientAppointmentsOptional: (token: string) =>
    requestOptional<{ appointments: Array<Record<string, string>> }>("/api/v1/patient/appointments", {
      token,
    }),
  getPatientConsultationsOptional: (token: string) =>
    requestOptional<{ consultations: CareConsultation[] }>("/api/v1/patient/consultations", { token }),
  getPatientPrescriptionsOptional: (token: string) =>
    requestOptional<{ prescriptions: CarePrescription[] }>("/api/v1/patient/prescriptions", { token }),
  getPatientDeliveriesOptional: (token: string) =>
    requestOptional<{ deliveries: CareDelivery[] }>("/api/v1/patient/deliveries", { token }),
  saveProfile: (token: string, data: Record<string, string>) =>
    request<{ accessToken: string; patientId: string }>("/api/v1/patients/profile", {
      method: "POST",
      token,
      body: JSON.stringify(data),
    }),
  triageGreeting: () => request<{ message: string }>("/api/v1/triage/greeting"),
  triageChat: (token: string, symptoms: string[], message: string) =>
    request<{ reply: string }>("/api/v1/triage/chat", {
      method: "POST",
      token,
      body: JSON.stringify({ symptoms, message }),
    }),
  triage: (token: string, symptoms: string[]) =>
    request("/api/v1/triage", { method: "POST", token, body: JSON.stringify({ symptoms }) }),
  getSlots: (token: string, specialty: string) =>
    request<{ slots: Array<Record<string, string>> }>(
      `/api/v1/appointments/slots?specialty=${encodeURIComponent(specialty)}`,
      { token }
    ),
  bookAppointment: (token: string, slot: Record<string, string>) =>
    request<{ appointmentId: string }>("/api/v1/appointments", {
      method: "POST",
      token,
      body: JSON.stringify({
        slotId: slot.id,
        practitionerId: slot.practitionerId,
        practitionerName: slot.practitionerName,
        specialty: slot.specialty,
        language: "en",
        startAt: slot.startAt,
        endAt: slot.endAt,
      }),
    }),
  startConsultation: (token: string, appointmentId: string) =>
    request<{ consultationId: string; roomId: string }>("/api/v1/consultations", {
      method: "POST",
      token,
      body: JSON.stringify({ appointmentId }),
    }),
  joinConsultation: (token: string, id: string) =>
    request("/api/v1/consultations/" + id + "/join", { method: "POST", token }),
  completeConsultation: (token: string, id: string) =>
    request("/api/v1/consultations/" + id + "/complete", {
      method: "POST",
      token,
      body: JSON.stringify({ notes: "Cardiology follow-up — stable vitals." }),
    }),
  getPrescriptionByConsultation: (token: string, consultationId: string) =>
    request<{ prescription: CarePrescription | null }>(
      `/api/v1/prescriptions/by-consultation/${encodeURIComponent(consultationId)}`,
      { token }
    ),
  getPrescriptionByConsultationOptional: (token: string, consultationId: string) =>
    requestOptional<{ prescription: CarePrescription | null }>(
      `/api/v1/prescriptions/by-consultation/${encodeURIComponent(consultationId)}`,
      { token }
    ),
  getPrescriptionByTrackingOptional: (token: string, trackingId: string) =>
    requestOptional<{ prescription: CarePrescription | null }>(
      `/api/v1/prescriptions/by-tracking/${encodeURIComponent(trackingId.trim())}`,
      { token }
    ),
  getPharmacies: (token: string) =>
    request<{ pharmacies: PharmacyOption[] }>("/api/v1/pharmacies", { token }),
  getPharmacyRecommendation: (token: string, prescriptionId: string) =>
    request<{
      prescriptionId: string;
      recommended: {
        pharmacyId: string;
        pharmacyName: string;
        routingReason: string;
        routingMode: string;
      };
      pharmacies: PharmacyOption[];
    }>(`/api/v1/prescriptions/${encodeURIComponent(prescriptionId)}/pharmacy-recommendation`, {
      token,
    }),
  routePrescription: (token: string, id: string, pharmacyId: string) =>
    request<{
      prescriptionId: string;
      trackingId?: string;
      pharmacyId?: string;
      pharmacyName?: string;
      routingReason?: string;
      routingMode?: string;
    }>("/api/v1/prescriptions/" + id + "/route", {
      method: "POST",
      token,
      body: JSON.stringify({ pharmacyId }),
    }),
  declinePharmacyOrder: (token: string, id: string) =>
    request<{ prescriptionId: string; status: string }>(
      `/api/v1/prescriptions/${encodeURIComponent(id)}/decline-pharmacy`,
      { method: "POST", token }
    ),
  createDelivery: (token: string, prescriptionId: string) =>
    request<{ deliveryId: string }>("/api/v1/deliveries", {
      method: "POST",
      token,
      body: JSON.stringify({ prescriptionId }),
    }),
  getDelivery: (token: string, id: string) =>
    request("/api/v1/deliveries/" + id, { token }),
  confirmDeliveryReceived: (token: string, deliveryId: string) =>
    request<{
      deliveryId: string;
      prescriptionId: string;
      deliveryStatus: string;
      prescriptionStatus: string;
      alreadyConfirmed?: boolean;
    }>(`/api/v1/deliveries/${encodeURIComponent(deliveryId)}/confirm-received`, {
      method: "POST",
      token,
    }),
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
};

export interface PharmacyOption {
  id: string;
  name: string;
  location: string;
  type: string;
  islands: string[];
  isHub: boolean;
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
