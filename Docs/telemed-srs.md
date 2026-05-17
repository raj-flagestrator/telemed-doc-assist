# Integrated TeleMed Software Requirements Specification

## Overview
Integrated TeleMed is a mobile-compatible, container-based, white-label telemedicine platform for citizens, hospitals, island clinics, specialists, pharmacies, ambulances, and government health authorities. The platform is intended to support remote consultations, AI-assisted diagnosis, Tele-ICU, ePrescription, pharmacy fulfillment, delivery tracking, remote patient monitoring, and public health dashboards in low-connectivity island and rural settings.[cite:10][cite:21][cite:22]

The platform shall be deployable using interchangeable OSS-first and commercial-ready infrastructure profiles, with the same application services operating against provider abstractions selected at deployment time.[cite:25][cite:33][cite:41][cite:46]

## Goals
- Reduce island-to-island patient travel through remote video consultation.
- Centralize access to specialists for remote islands.
- Improve emergency response through Tele-ICU and ambulance integration.
- Improve chronic disease management through remote patient monitoring and alerts.
- Improve medicine accessibility through integrated pharmacy dispatch and delivery.
- Digitize healthcare workflows using a shared EHR/EMR and interoperability layer.
- Provide island-level utilization and disease analytics for health authorities.

## Stakeholders
- Citizens / patients
- Doctors and specialists
- Hospitals and island clinics
- Pharmacies and delivery staff
- Ambulance operators
- Government health authorities
- Tenant administrators / white-label operators

## Functional requirements

### FR-1 Registration and identity
- The system shall support mobile OTP-based registration and login.[cite:22]
- The system shall support national ID linking through pluggable integration adapters.
- The system shall support insurance linking through pluggable integration adapters.
- The system shall support RBAC for patient, doctor, pharmacist, ambulance operator, government analyst, tenant admin, and platform super-admin roles.
- The system shall support tenant-aware branding and custom domains.[cite:22]

### FR-2 Symptom screening and triage
- The patient application shall provide an AI or rules-based symptom checker.
- The symptom checker shall collect symptoms, calculate risk score, and recommend next action or specialist referral.
- The AI triage module shall be optional and disableable by tenant configuration.

### FR-3 Appointments
- The system shall support doctor availability management, booking, rescheduling, cancellation, and reminders.
- The booking workflow shall support language selection and consultation mode selection.
- The system shall persist appointment data using FHIR-aligned scheduling concepts such as Appointment, Schedule, and Slot.[cite:10][cite:20]

### FR-4 Video consultation
- The system shall support secure teleconsultation using WebRTC with TURN/STUN support.[cite:21][cite:96]
- The consultation module shall support file sharing, chat, live notes, and encounter lifecycle management.
- The platform shall support audio-only fallback in low-bandwidth conditions.[cite:24]

### FR-5 Medical records and documents
- The system shall support report uploads, lab documents, and document retrieval.
- The system shall maintain patient history, encounters, prescriptions, observations, and uploaded reports using FHIR-aligned resources such as Encounter, Observation, MedicationRequest, and DocumentReference.[cite:10][cite:11][cite:12]

### FR-6 ePrescription and pharmacy routing
- Doctors shall be able to create digitally signed prescriptions.
- Prescriptions shall be routed automatically to selected or rule-resolved pharmacies.
- Pharmacy users shall be able to validate stock, verify insurance, dispatch medicines, and track fulfillment.

### FR-7 Medication delivery
- The system shall support delivery assignment, GPS tracking, delivery status updates, and delivery confirmation.
- The platform shall support pluggable map and routing providers.

### FR-8 Remote patient monitoring
- The platform shall support device registration, telemetry ingestion, threshold checks, alerting, and trend visualization.
- The RPM module shall support MQTT-based device ingestion with provider selection at deployment time.
- Patient vitals shall be represented as FHIR-aligned observations when persisted to the clinical record.[cite:10]

### FR-9 Tele-ICU
- The platform shall support Tele-ICU monitoring views, alerting, and escalation workflows.
- The Tele-ICU module shall be independently deployable and tenant-toggleable.

### FR-10 Government analytics
- The platform shall provide dashboards for island-wise healthcare monitoring, disease trends, ICU occupancy, telemedicine utilization, and emergency alerts.
- Government analytics shall read from curated analytics data stores, not directly from transactional services.

### FR-11 White-labeling
- The platform shall support per-tenant theming, logos, custom domains, legal templates, notification templates, and enabled modules.[cite:22]
- The platform shall support tenant-specific workflow overrides and integration credentials.

### FR-12 Deployment profiles
- The platform shall support at least two deployment profiles: Pure OSS and commercial-ready.[cite:25][cite:33][cite:41][cite:46][cite:60]
- The platform shall keep business services independent of vendor-specific APIs through internal provider contracts.

## Non-functional requirements

### NFR-1 Availability and reliability
- The pilot baseline shall target 99.9% service availability.[cite:6]
- Critical services shall expose health, readiness, and metrics endpoints.
- Asynchronous workflows shall use retry, DLQ, and idempotency patterns.

### NFR-2 Performance
- Standard transactional APIs should target sub-500ms response under nominal load.[cite:6]
- Video session establishment and consultation join success shall be observable by p95 latency and completion metrics.

### NFR-3 Security
- The platform shall use OIDC/OAuth2-based authentication and short-lived access tokens.[cite:14][cite:22]
- PHI shall be encrypted in transit and at rest.
- Audit trails shall exist for access, prescription actions, AI actions, and admin configuration changes.

### NFR-4 Scalability
- The architecture shall support horizontal scaling of signaling, notification, AI, analytics API, and realtime ingestion services.[cite:3][cite:9]
- The deployment model shall support shared multi-tenant, dedicated namespace, and fully dedicated tenant modes.[cite:22]

### NFR-5 Observability
- The platform shall emit structured logs, metrics, and traces across services.
- The platform shall support Prometheus-compatible metrics exposure and OpenTelemetry-based tracing integration.[cite:56][cite:81]

### NFR-6 Compliance and governance
- The platform shall support consent records, audit retention, and configurable data retention by tenant.
- AI modules shall log advisory output metadata and require human review for high-risk suggestions.

### NFR-7 Mobile compatibility
- The patient experience shall be usable on Android and iOS devices.
- The platform shall tolerate unstable connectivity through retries, resumable uploads, and adaptive media behavior.[cite:21][cite:24]

## External interfaces
- Mobile apps for patients and field users
- Web portals for doctors, pharmacies, tenant admins, and government authorities
- FHIR APIs for clinical interoperability.[cite:10][cite:14]
- REST APIs for operational workflows
- Async event streams for cross-service workflows
- Adapter interfaces for national ID, insurance, payment, SMS, maps, labs, and ambulance systems

## Assumptions and constraints
- The system shall be containerized and deployable on Kubernetes in production.
- Tenant customization shall not require application code changes.
- Optional modules such as AI diagnosis assist and Tele-ICU shall be plug-and-play.
- Licensing-sensitive components shall be swappable through deployment profiles.
