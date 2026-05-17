/** Pharmacy BFF (4102). In dev, default direct URL so verify works even without Vite proxy. */
function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:4102";
  return "";
}

const API = resolveApiBase();

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
    const text = await res.text();
    let message = res.statusText || "Request failed";
    try {
      const body = JSON.parse(text) as { error?: string; detail?: string };
      if (body.error) message = body.error;
      else if (typeof body.detail === "string") message = body.detail;
    } catch {
      if (text && !text.startsWith("<")) message = text;
    }
    if (message === "Internal Server Error") {
      message =
        "Pharmacy API error — restart backends: python scripts/run_all.py (from the prototype folder)";
    }
    if (res.status === 404 && message === "Not Found") {
      message =
        "Pharmacy API not reachable — open http://localhost:5175 (not the doctor portal), then run: python scripts/run_all.py";
    }
    throw new Error(message);
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

export interface PharmacyAccount {
  email: string;
  name: string;
  pharmacyId: string;
  pharmacyName: string;
  role: string;
}

export interface QueueItem {
  fulfillmentId: string;
  prescriptionId: string;
  trackingId?: string;
  patientName: string;
  patientIsland: string | null;
  insuranceId: string | null;
  medicationCount: number;
  medicationsSummary: string;
  prescriptionStatus?: string;
  fulfillmentStatus: string;
  insuranceStatus: string;
  deliveryId?: string | null;
  deliveryStatus?: string | null;
  signedAt: string;
}

export interface OrdersResponse {
  pharmacyId: string;
  queue: QueueItem[];
  orders: QueueItem[];
  count: number;
  activeCount: number;
  statusCounts: Record<string, number>;
}

export interface StockItem {
  medicationName: string;
  dosage: string;
  quantity: number;
  lowThreshold: number;
  lowStock: boolean;
}

export interface VerifyTrackingResult {
  trackingId: string;
  prescriptionId: string;
  fulfillmentId: string;
  patientName: string;
  patientIsland: string | null;
  insuranceId: string | null;
  prescriptionStatus: string;
  fulfillmentStatus: string;
  medicationsSummary: string;
  verified: boolean;
}

export interface FulfillmentDetail {
  fulfillmentId: string;
  prescriptionId: string;
  trackingId?: string;
  status: string;
  insuranceStatus: string;
  stockReserved: boolean;
  deliveryId: string | null;
  signedAt: string;
  medications: Array<{ name: string; dosage: string; frequency: string; duration: string }>;
  patient: {
    id: string;
    fullName: string;
    phone: string;
    nationalId: string | null;
    insuranceId: string | null;
    island: string | null;
  };
  stockChecks: Array<{
    name: string;
    dosage: string;
    available: boolean;
    quantityOnHand: number;
    lowStock: boolean;
  }>;
  delivery: {
    id: string;
    status: string;
    pharmacyName: string;
    etaMinutes: number;
    trackingSteps?: Array<{ label: string; completed: boolean; at: string }>;
  } | null;
}

export const api = {
  getConfig: () => request<TenantConfig>("/api/v1/config"),
  getAccounts: () => request<{ accounts: PharmacyAccount[] }>("/api/v1/pharmacy/accounts"),
  requestOtp: (email: string) =>
    request("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ email }) }),
  verifyOtp: (email: string, code: string) =>
    request<{
      accessToken: string;
      pharmacyId: string;
      pharmacyName: string;
      displayName: string;
      staffRole: string;
    }>("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ email, code }) }),
  getQueue: (token: string) => request<OrdersResponse>("/api/v1/pharmacy/queue", { token }),
  getOrders: async (token: string) => {
    try {
      return await request<OrdersResponse>("/api/v1/pharmacy/orders", { token });
    } catch (e) {
      if (e instanceof Error && /not found/i.test(e.message)) {
        return request<OrdersResponse>("/api/v1/pharmacy/queue", { token });
      }
      throw e;
    }
  },
  verifyTracking: (token: string, trackingId: string) => {
    const id = encodeURIComponent(trackingId.trim());
    return request<VerifyTrackingResult>(`/api/v1/pharmacy/verify?trackingId=${id}`, { token });
  },
  getStock: (token: string) =>
    request<{ items: StockItem[]; lowStockCount: number; pharmacyName: string }>(
      "/api/v1/pharmacy/stock",
      { token }
    ),
  getFulfillment: (token: string, id: string) =>
    request<FulfillmentDetail>(`/api/v1/pharmacy/fulfillments/${id}`, { token }),
  verifyInsurance: (token: string, id: string) =>
    request(`/api/v1/pharmacy/fulfillments/${id}/verify-insurance`, { method: "POST", token }),
  reserveStock: (token: string, id: string) =>
    request<{
      status: string;
      shortage?: boolean;
      autoRerouted?: boolean;
      pharmacyName?: string;
      message?: string;
    }>(`/api/v1/pharmacy/fulfillments/${id}/reserve-stock`, { method: "POST", token }),
  markReady: (token: string, id: string) =>
    request(`/api/v1/pharmacy/fulfillments/${id}/mark-ready`, { method: "POST", token }),
  createDelivery: (token: string, id: string, prescriptionId: string, patientId: string) =>
    request(`/api/v1/pharmacy/fulfillments/${id}/create-delivery`, {
      method: "POST",
      token,
      body: JSON.stringify({ prescriptionId, patientId }),
    }),
  dispatch: (token: string, id: string) =>
    request(`/api/v1/pharmacy/fulfillments/${id}/dispatch`, { method: "POST", token }),
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

export interface PharmacyNotification {
  id: string;
  prescriptionId: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
