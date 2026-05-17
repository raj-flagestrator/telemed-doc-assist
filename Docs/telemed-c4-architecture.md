# Integrated TeleMed C4 Architecture Document

## Context
Integrated TeleMed is a multi-tenant telemedicine platform serving patients, doctors, pharmacies, clinics, hospitals, ambulance teams, and government health authorities through mobile and web channels. The solution uses a modular microservices architecture, standards-based healthcare interoperability, and profile-based infrastructure selection so the same product can run in OSS-first or commercial-ready environments.[cite:10][cite:21][cite:22][cite:25][cite:41]

## C1 System Context

### Primary actors
- Patient / citizen
- Doctor / specialist
- Pharmacist
- Ambulance operator
- Government analyst
- Tenant administrator
- Platform operator

### External systems
- National ID provider
- Insurance provider
- Payment gateway
- SMS/OTP provider
- Email provider
- Push notification providers
- Map/routing provider
- Optional managed AI provider
- Optional managed RTC provider
- Optional external lab / PACS / LIS systems

### Platform responsibilities
- Registration and tenant-aware access
- Triage and appointment booking
- Video consultation and clinical documentation
- Prescription routing and pharmacy fulfillment
- Remote patient monitoring and alerting
- Tele-ICU and emergency escalation
- Government and public health analytics

## C2 Container View

### Client containers
- Patient mobile app
- Doctor web portal
- Pharmacy web portal
- Government dashboard
- Tenant admin console

### Edge containers
- API gateway
- BFF patient
- BFF doctor
- BFF pharmacy
- BFF government

### Core business containers
- Identity service
- Tenant config service
- Patient service
- Provider registry service
- Appointment service
- Consultation service
- EHR/clinical records service
- Prescription service
- Pharmacy service
- Delivery service
- Insurance service
- Payment service
- Notification service
- Audit and consent service
- Analytics service
- Integration hub

### Specialized containers
- Video signaling service
- TURN/STUN service
- Realtime messaging service
- RPM service
- Tele-ICU service
- AI triage service
- AI clinical assist service
- Clinical rules service
- OCR/document processing service
- Imaging integration service

### Data/infrastructure containers
- Keycloak
- PostgreSQL clusters
- Cache store
- Kafka or alternative stream platform
- FHIR repository
- Object storage
- Search cluster
- Metrics, logs, traces stack

## C3 Component View

### Consultation service components
- Encounter lifecycle manager
- Consultation session coordinator
- Notes and artifact orchestrator
- Audit emitter
- Event publisher

### Prescription service components
- Prescription authoring engine
- Digital signature integration
- FHIR mapping adapter
- Pharmacy routing engine
- Prescription audit logger

### RPM service components
- Device registry
- Telemetry ingestion adapter
- Threshold rules engine
- Observation persistence adapter
- Alert publisher

### Tenant config service components
- Theme manager
- Feature flag manager
- Custom domain resolver
- Integration profile manager
- Legal/template manager

### Integration hub components
- Adapter registry
- Credential vault bridge
- Webhook receiver
- Outbound connector scheduler
- Mapping/transformation engine

## C4 Code/implementation guidance

### Service boundaries
Each business service should own its own schema or database boundary and expose APIs and events rather than direct table sharing. Event-driven workflows should coordinate cross-service actions such as consultation completion, prescription issuance, dispatch creation, and RPM alert escalation.[cite:3][cite:9]

### Provider abstraction layer
Infrastructure-sensitive dependencies should be consumed through provider contracts such as `GatewayProvider`, `CacheProvider`, `EventBusProvider`, `ObjectStorageProvider`, `RtcProvider`, `MqttProvider`, and `AiClinicalAssistProvider`. This allows deployment profile switching without modifying service business logic.[cite:46][cite:60][cite:81]

### White-label layer
Tenant-aware branding should be resolved through domain, token claim, or request context, then applied via tenant configuration to mobile and web apps. Tenant config should drive theme, logo, enabled modules, templates, language, and customer-specific integrations.[cite:22]

## Deployment modes
- Shared multi-tenant cluster
- Dedicated tenant namespace in shared cluster
- Fully dedicated cluster per regulated customer

## Cross-cutting concerns
- OpenTelemetry tracing
- Structured logging
- Audit and consent logging
- Data encryption and secrets management
- Feature flags and module toggles
- Backups and DR
- CI/CD with profile-specific deployment manifests
