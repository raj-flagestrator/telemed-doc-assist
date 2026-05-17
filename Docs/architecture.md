# MediSphere AI — Architecture

Architecture for **MediSphere AI**: unified telemedicine for island healthcare. This document covers the **product vision** (from [planning-discussion.md](./planning-discussion.md)) and what the **[prototype](../prototype/)** implements today.

**Runnable prototype:** see [prototype/README.md](../prototype/README.md) for ports, setup, and golden-path demo.

### PNG exports

| Diagram | File |
|---------|------|
| High-level | [diagrams/high-level-architecture.png](./diagrams/high-level-architecture.png) |
| Low-level | [diagrams/low-level-architecture.png](./diagrams/low-level-architecture.png) |

Source (Mermaid): [diagrams/high-level-architecture.mmd](./diagrams/high-level-architecture.mmd), [diagrams/low-level-architecture.mmd](./diagrams/low-level-architecture.mmd). Regenerate with:

```bash
cd Planning-Docs/diagrams
npx -y @mermaid-js/mermaid-cli -i high-level-architecture.mmd -o high-level-architecture.png -b white -w 2800
npx -y @mermaid-js/mermaid-cli -i low-level-architecture.mmd -o low-level-architecture.png -b white -w 2800
```

![High-level architecture](./diagrams/high-level-architecture.png)

![Low-level architecture](./diagrams/low-level-architecture.png)

---

## High-level architecture

### 1. Product context & stakeholders

```mermaid
flowchart TB
    subgraph Stakeholders["Stakeholders (product vision)"]
        C[Citizens / patients]
        D[Doctors & specialists]
        H[Hospitals & island clinics]
        P[Pharmacies]
        G[Government health authorities]
        A[Ambulance / emergency]
    end

    subgraph Platform["MediSphere AI platform"]
        TM[Telemedicine & consult]
        AI[AI triage & clinical assist]
        RX[ePrescription & routing]
        DEL[Medication delivery]
        RPM[Remote monitoring / IoT]
        AN[Analytics & command center]
    end

    C --> TM
    C --> AI
    C --> DEL
    D --> TM
    D --> RX
    H --> TM
    P --> RX
    P --> DEL
    G --> AN
    A -.-> TM

    style RPM fill:#f5f5f5,stroke-dasharray: 5 5
    style AN fill:#f5f5f5,stroke-dasharray: 5 5
```

*Dashed: planned in product docs; not in the current prototype.*

---

### 2. Logical layers (channel → orchestration → domain)

```mermaid
flowchart LR
    subgraph Channels["Presentation (channels)"]
        PW[Patient web<br/>mobile-first · :5173]
        DW[Doctor web<br/>portal · :5174]
        PH[Pharmacy portal<br/>planned]
        GD[Gov dashboard<br/>planned]
    end

    subgraph Edge["API / BFF layer"]
        PBFF[Patient BFF<br/>:4100]
        DBFF[Doctor BFF<br/>:4101]
    end

    subgraph Domain["Domain microservices · FastAPI"]
        ID[Identity :4001]
        TC[Tenant config :4002]
        PT[Patient :4003]
        AP[Appointment :4004]
        CN[Consultation :4005]
        PR[Prescription :4006]
        TR[AI triage :4007]
        DL[Delivery :4008]
    end

    subgraph Data["Data & platform"]
        PG[(PostgreSQL :5434)]
        JWT[JWT auth]
        WH[Whitelabel tenant config]
    end

    PW --> PBFF
    DW --> DBFF
    PH -.-> Domain
    GD -.-> Domain

    PBFF --> Domain
    DBFF --> Domain
    Domain --> PG
    ID & PBFF & DBFF --> JWT
    TC --> WH
```

**Design principles**

| Principle | How it shows up |
|-----------|------------------|
| **BFF per channel** | Patient and doctor UIs talk only to their BFF; BFF aggregates calls and shapes DTOs for the golden path. |
| **Domain-owned data** | Each service owns its tables and migrations (`schema_migrations` per service). |
| **Multi-tenant / whitelabel** | `tenant-config-service` supplies logo, title, copy per tenant (`demo-maldives`). |
| **AI-assisted, human-centered** | Triage and Rx recommendations assist; doctor signs prescriptions. |

---

### 3. Patient golden path (business flow)

```mermaid
flowchart TD
    L[Login · OTP] --> P[Profile · island / insurance]
    P --> T[AI symptom check / triage]
    T --> B[Book appointment · specialty slot]
    B --> V[Video consultation]
    V --> E[ePrescription]
    E --> F[Pharmacy routing]
    F --> D[Delivery tracking]
    D --> M[My Care · history & status]

    T -.->|recommends| SP[Cardiology · ENT · Gastro · GP]
    B -.->|matches| SP
```

**Doctor path (parallel):** login → schedule → visit detail → consult → prescribe → complete.

---

## Low-level architecture

### 4. Runtime deployment (prototype)

```mermaid
flowchart TB
    subgraph Browser["Developer machine"]
        subgraph UI["Vite dev servers"]
            P5173[patient-web :5173]
            D5174[doctor-web :5174]
        end

        subgraph Python["run_all.py · single PYTHONPATH"]
            BFF1[patient_bff :4100]
            BFF2[doctor_bff :4101]
            S1[identity :4001]
            S2[tenant-config :4002]
            S3[patient :4003]
            S4[appointment :4004]
            S5[consultation :4005]
            S6[prescription :4006]
            S7[ai-triage :4007]
            S8[delivery :4008]
        end

        subgraph SharedLib["medisphere/ shared library"]
            AUTH[auth · JWT]
            DBL[db · asyncpg pool]
            TRI[triage_engine]
            DOC[doctor_auth · practitioners]
            VS[visit_status]
            HTTP[http_client · service_fetch]
        end
    end

    subgraph Docker["Docker Compose"]
        PG[(postgres:16<br/>host :5434)]
    end

    P5173 -->|proxy /api| BFF1
    D5174 -->|proxy /api| BFF2
    BFF1 & BFF2 --> S1 & S2 & S3 & S4 & S5 & S6 & S7 & S8
    S1 & S3 & S4 & S5 & S6 & S7 & S8 & BFF2 --> PG
    S1 & S2 & S3 & S4 & S5 & S6 & S7 & S8 & BFF1 & BFF2 --> SharedLib
```

**Inter-service transport:** synchronous **HTTP/JSON** via `httpx` (`service_fetch`), Bearer JWT on protected routes.

**Observability (each service):** `/health`, `/ready`, `/metrics`, `/version`.

---

### 5. Service responsibilities & data ownership

```mermaid
erDiagram
    TENANT_CONFIG ||--o{ IDENTITY_USERS : "tenant_id"
    IDENTITY_USERS ||--o| PATIENTS : "patient_id"
    PATIENTS ||--o{ TRIAGE_ASSESSMENTS : "patient_id"
    PATIENTS ||--o{ APPOINTMENTS : "patient_id"
    APPOINTMENTS ||--o| CONSULTATIONS : "appointment_id"
    CONSULTATIONS ||--o| PRESCRIPTIONS : "consultation_id"
    PRESCRIPTIONS ||--o| DELIVERIES : "prescription_id"

    TENANT_CONFIG {
        text tenant_id PK
        json branding_config
    }
    IDENTITY_USERS {
        uuid id PK
        text phone
        uuid patient_id
    }
    PATIENTS {
        uuid patient_id PK
        text full_name
        text island
    }
    TRIAGE_ASSESSMENTS {
        uuid id PK
        text specialty_recommended
    }
    APPOINTMENTS {
        uuid id PK
        text practitioner_id
        text status
    }
    CONSULTATIONS {
        uuid id PK
        text status
        text room_id
    }
    PRESCRIPTIONS {
        uuid id PK
        text status
    }
    DELIVERIES {
        uuid id PK
        text status
    }
```

| Service | Port | Owns | Primary APIs (conceptual) |
|---------|------|------|---------------------------|
| **identity** | 4001 | `identity_users`, `identity_otp` | Patient OTP; doctor directory; link user ↔ patient |
| **tenant-config** | 4002 | `tenant_config` | Whitelabel branding per tenant |
| **patient** | 4003 | `patients` | CRUD profile |
| **appointment** | 4004 | `appointments` | Slots, book, practitioner schedule |
| **consultation** | 4005 | `consultations` | Start/join/complete visit (prototype room IDs) |
| **prescription** | 4006 | `prescriptions` | Recommend, sign, route to pharmacy |
| **ai-triage** | 4007 | `triage_assessments` | Symptom assessment API (patient UI also uses client-side engine) |
| **delivery** | 4008 | `deliveries` | Fulfillment status chain |
| **patient-bff** | 4100 | — (stateless) | Golden-path orchestration, `visitStatus`, My Care bundles |
| **doctor-bff** | 4101 | — (stateless) | Schedule aggregation, doctor OTP (`doctor_auth`), consult/Rx flows |

**Unified visit state:** `medisphere/visit_status.py` derives `visitStatus` (`booked` → `ready` → `in_progress` → `awaiting_rx` → `completed`) from appointment + consultation + prescription for both portals.

---

### 6. Request flow — book & consult (sequence)

```mermaid
sequenceDiagram
    actor Patient as Patient UI :5173
    participant PBFF as Patient BFF :4100
    participant ID as Identity :4001
    participant PT as Patient :4003
    participant TR as AI Triage :4007
    participant AP as Appointment :4004
    actor Doctor as Doctor UI :5174
    participant DBFF as Doctor BFF :4101
    participant CN as Consultation :4005
    participant RX as Prescription :4006
    participant DL as Delivery :4008

    Patient->>PBFF: POST /auth/otp/*
    PBFF->>ID: OTP request/verify
    ID-->>Patient: JWT (patient)

    Patient->>PBFF: POST /patients/profile
    PBFF->>PT: create/update patient
    PBFF->>ID: link patientId to user

    Patient->>PBFF: POST /triage (symptoms)
    PBFF->>TR: save assessment
    Note over Patient: Client triageChat also runs locally

    Patient->>PBFF: POST /appointments/book
    PBFF->>AP: book slot (specialty)

    Doctor->>DBFF: POST /auth/otp/* (doctor_auth + DB)
    Note over DBFF: Uses practitioners registry; not identity-only list

    Doctor->>DBFF: GET /schedule
    DBFF->>AP: practitioner appointments
    DBFF->>PT: patient names
    DBFF->>CN: consultation by appointment
    DBFF-->>Doctor: aggregated schedule cards

    Patient->>PBFF: POST /consultations/join
    PBFF->>CN: join room
    Doctor->>DBFF: POST /consultations/start|join
    DBFF->>CN: doctor side

    Doctor->>DBFF: POST /prescriptions
    DBFF->>RX: sign & route
    DBFF->>AP: mark completed
    Patient->>PBFF: GET /care/appointments/{id}
    PBFF->>AP & CN & RX & DL: bundle for My Care detail
```

---

### 7. Shared kernel (`medisphere/`)

```mermaid
flowchart LR
    subgraph medisphere["medisphere/ (shared Python package)"]
        AF[app_factory · FastAPI + middleware]
        AU[auth · sign_token / decode_token]
        CF[config · service URLs + DB]
        DB[db · pool + migrations lock]
        HC[http_client · service_fetch]
        TE[triage_engine]
        PA[prescription_ai]
        PRAC[practitioners · 4 demo doctors]
        DA[doctor_auth · OTP]
        VS[visit_status]
    end

    SVC[8 microservices] --> medisphere
    BFF[2 BFFs] --> medisphere
```

---

## Scope summary

| Layer | In prototype today | Planned (planning docs) |
|-------|--------------------|-------------------------|
| **Channels** | Patient web, Doctor web | Pharmacy portal, Government dashboard, native mobile |
| **Realtime** | Prototype consult “rooms” (not full WebRTC stack) | Secure WebRTC, Tele-ICU |
| **AI** | Rule/keyword triage + Rx suggest | Richer models, outbreak analytics |
| **Integrations** | Demo OTP, local Postgres | National ID, insurance, GPS courier, wearables |
| **Ops** | `run_all.py`, Docker DB only | Full K8s / per-service containers in production |

---

## Related documents

- [planning-discussion.md](./planning-discussion.md) — product objectives, modules, 30-minute demo scenario
- [../prototype/README.md](../prototype/README.md) — setup, ports, appointment/visit statuses
