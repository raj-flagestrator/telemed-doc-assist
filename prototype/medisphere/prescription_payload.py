"""Serialize prescription rows with trackingId for all portals."""

from __future__ import annotations

import json
from typing import Any

from medisphere.pharmacies import pharmacy_display
from medisphere.prescription_tracking import tracking_id_from_prescription_id
from medisphere.routing_history import routing_history_from_row


def _meds(raw: Any) -> list:
    if isinstance(raw, str):
        return json.loads(raw)
    return raw or []


def prescription_public(
    *,
    prescription_id: str,
    consultation_id: str | None = None,
    appointment_id: str | None = None,
    medications: Any = None,
    status: str | None = None,
    pharmacy_id: str | None = None,
    signed_at: Any = None,
    created_at: Any = None,
    extra: dict | None = None,
) -> dict:
    rx_id = str(prescription_id)
    payload: dict = {
        "id": rx_id,
        "prescriptionId": rx_id,
        "trackingId": tracking_id_from_prescription_id(rx_id),
    }
    if consultation_id is not None:
        payload["consultationId"] = str(consultation_id)
    if appointment_id is not None:
        payload["appointmentId"] = str(appointment_id)
    if medications is not None:
        payload["medications"] = _meds(medications)
    if status is not None:
        payload["status"] = status
    if pharmacy_id is not None:
        payload["pharmacyId"] = pharmacy_id
        payload["pharmacyName"] = pharmacy_display(pharmacy_id)
    routing_history: Any = None
    if extra and "routingHistory" in extra:
        routing_history = extra.get("routingHistory")
    if routing_history is not None:
        payload["routingHistory"] = routing_history
    if signed_at is not None:
        payload["signedAt"] = signed_at.isoformat() if hasattr(signed_at, "isoformat") else signed_at
    if created_at is not None:
        payload["createdAt"] = created_at.isoformat() if hasattr(created_at, "isoformat") else created_at
    if extra:
        payload.update(extra)
    return payload


def prescription_from_row(row, *, include_consultation: bool = True) -> dict:
    consult_id = row.get("consultation_id")
    appt_id = row.get("appointment_id")
    return prescription_public(
        prescription_id=str(row["id"]),
        consultation_id=str(consult_id) if consult_id else None,
        appointment_id=str(appt_id) if appt_id else None,
        medications=row["medications"],
        status=row["status"],
        pharmacy_id=row.get("pharmacy_id"),
        signed_at=row.get("signed_at"),
        created_at=row.get("created_at"),
        extra={"routingHistory": routing_history_from_row(row)},
    )
