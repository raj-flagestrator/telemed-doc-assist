# Integrated TeleMed Technical Specifications

## Product intent
Integrated TeleMed is a modular, mobile-compatible, containerized healthcare platform designed for telemedicine, remote monitoring, pharmacy integration, Tele-ICU, and government analytics. It is explicitly intended to support white-label operation and tenant-specific deployments while allowing OSS-first or commercial-ready infrastructure selection during deployment.[cite:21][cite:22][cite:25][cite:41]

## Architectural principles
- Microservices with bounded contexts
- API-first and event-driven integration
- FHIR-aligned clinical data model for interoperability.[cite:10][cite:14]
- White-label multi-tenancy from day one.[cite:22]
- Mobile-first and low-bandwidth resilient channel design.[cite:21][cite:24]
- Deployment profile switching through provider abstractions.[cite:46][cite:60][cite:81]

## Core services
| Service | Responsibility |
|---|---|
| identity-service | Authentication, authorization, token lifecycle, role mapping |
| tenant-config-service | Theme, branding, domain, feature flags, tenant integrations |
| patient-service | Patient demographics and master identity linkage |
| provider-service | Practitioner, organization, and facility registry |
| appointment-service | Slot, schedule, booking, reminder workflows |
| consultation-service | Encounter lifecycle, in-consult orchestration, notes |
| ehr-service | Longitudinal clinical record, observations, reports |
| prescription-service | Prescription issue, sign, route, and audit |
| pharmacy-service | Prescription queue, stock, substitution, dispatch handoff |
| delivery-service | Delivery assignment, GPS updates, proof of delivery |
| insurance-service | Eligibility, preauth, payer workflows |
| payment-service | Fee collection, settlement, refunds |
| rpm-service | Device registry, telemetry ingestion, alerting |
| teleicu-service | ICU monitoring, escalation, command center views |
| ai-triage-service | Symptom triage and routing |
| ai-clinical-assist-service | Clinical summarization and advisory support |
| analytics-service | Curated metrics, dashboards, public health insights |
| integration-hub | External adapters and mappings |
| audit-consent-service | Audit logs, consent records, access trail |

## FHIR alignment
The platform should map core business objects to FHIR R4 resources including Patient, Practitioner, Organization, Appointment, Encounter, Observation, MedicationRequest, Coverage, Task, Device, and DocumentReference.[cite:10][cite:11][cite:12][cite:20]

## Realtime architecture
Teleconsultation should use secure WebRTC with TURN/STUN support because TURN is effectively required for real-world connectivity reliability, especially on mobile and constrained networks.[cite:21][cite:96] Tele-ICU and larger conferencing scenarios should use SFU-style media distribution rather than strict peer-to-peer.

## White-label architecture
Tenant branding should be stored in a tenant configuration service and applied at runtime across mobile and web channels. Supported white-label assets should include names, logos, colors, domain aliases, legal text, email/SMS templates, feature flags, and workflow overrides.[cite:22]

## Deployment profile model
The system should maintain identical application containers across deployment profiles while swapping infrastructure providers via configuration. Recommended baseline profiles are Pure OSS and commercial-ready.[cite:25][cite:33][cite:41][cite:46][cite:60]

### Pure OSS baseline
- Keycloak
- PostgreSQL
- Valkey-style cache path
- Apache Kafka
- Apache APISIX
- NGINX OSS
- OpenSearch
- Prometheus
- Self-hosted WebRTC plus coturn
- Mosquitto for MQTT

### Commercial-ready baseline
- Supported Keycloak
- Managed PostgreSQL
- Redis commercial/managed cache
- Redpanda Enterprise or managed Kafka
- Kong Enterprise
- Managed object storage
- Managed RTC/TURN
- HiveMQ Enterprise or equivalent
- Managed observability

## Security specifications
- OIDC/OAuth2-based identity and short-lived tokens.[cite:14][cite:22]
- Tenant-aware RBAC and optional ABAC.
- Encryption at rest and in transit.
- Immutable or append-only audit pattern for regulated actions.
- Consent tracking for clinical data sharing and AI assistance.
- Malware scanning and metadata extraction for file uploads.

## Observability specifications
The platform should expose `/health`, `/ready`, and `/metrics` on each service and publish structured logs and traces through a consistent telemetry model. Prometheus-compatible metrics and AGPL-licensed Grafana/Loki/Tempo OSS options are available, with managed alternatives for enterprise operations.[cite:56][cite:57][cite:58][cite:81]

## Mobile compatibility specifications
- Native or cross-platform mobile patient experience
- Adaptive bitrate or audio-only fallback for consultations.[cite:24]
- Offline-tolerant queues for file uploads and status sync.
- Push notifications for booking, prescription, and care alerts.
- Multi-language support through tenant/runtime language packs.

## Vibe coding guidance
- Build each service with a clear interface, health endpoint, metrics endpoint, and OpenAPI contract.
- Do not leak infrastructure vendor APIs into business logic.
- Use events for cross-service workflows, not shared tables.
- Keep optional modules independently deployable.
- Design each frontend shell to resolve tenant theme and enabled modules at bootstrap.
- Prefer adapter registries and provider contracts over one-off integrations.
