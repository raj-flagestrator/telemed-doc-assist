# Integrated TeleMed Provider Contracts

## Purpose
This document defines the provider abstractions that decouple business services from infrastructure vendors and allow switching between Pure OSS and commercial-ready deployment profiles.

## Required contracts

### GatewayProvider
Responsibilities: route registration, auth policies, throttling, upstream health.

### IdentityProvider
Responsibilities: user lifecycle, role mapping, token validation, tenant theme resolution.

### RelationalStore
Responsibilities: migration, transaction management, connection management.

### CacheProvider
Responsibilities: cache, session, pub/sub, distributed locks.

### EventBusProvider
Responsibilities: publish, consume, topic creation, replay, dead-letter workflows.

### ClinicalInteropStore
Responsibilities: FHIR CRUD, search, bundle transaction, bulk export.

### ObjectStorageProvider
Responsibilities: object CRUD, signed URLs, retention.

### SearchProvider
Responsibilities: indexing and query abstraction.

### MetricsProvider
Responsibilities: counters, gauges, histograms, exposition.

### LogProvider
Responsibilities: structured logging, querying, redaction.

### TraceProvider
Responsibilities: span lifecycle and telemetry export.

### RtcProvider
Responsibilities: room lifecycle, token issuance, optional recording.

### TurnProvider
Responsibilities: TURN credential issuance and health validation.

### MqttProvider
Responsibilities: device registration, telemetry publish/subscribe, disconnect control.

### TimeseriesProvider
Responsibilities: time range writes, reads, and aggregations.

### AiTriageProvider
Responsibilities: symptom intake, risk scoring, explanation.

### AiClinicalAssistProvider
Responsibilities: summarization, finding extraction, differential suggestions, explanation.

## Compatibility rule
No service may call a provider-specific SDK directly from domain logic. Provider-specific SDK code must reside in the adapter implementing the corresponding contract.
