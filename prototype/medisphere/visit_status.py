"""Shared appointment visit status for doctor and patient portals."""

from __future__ import annotations

# Statuses where the patient may view medication details and tracking.
PATIENT_VISIBLE_RX_STATUSES = frozenset(
    {"signed", "routed", "pharmacy_declined", "fulfilled"}
)

# Hide only internal/non-patient statuses; all other values remain visible.
PATIENT_HIDDEN_RX_STATUSES = frozenset({"draft", "cancelled"})


def prescription_is_patient_visible(prescription: dict | None) -> bool:
    if not prescription:
        return False
    status = prescription.get("status") or ""
    if status in PATIENT_HIDDEN_RX_STATUSES:
        return False
    return True


def visit_status(
    appt: dict,
    consultation: dict | None,
    prescription: dict | None = None,
    *,
    has_prescription: bool | None = None,
) -> str:
    """Derive visit status. Pass *prescription* dict (preferred) or legacy *has_prescription* bool."""
    if has_prescription is not None:
        rx_visible = has_prescription
    else:
        rx_visible = prescription_is_patient_visible(prescription)

    if rx_visible or appt.get("status") == "completed":
        return "completed"
    if consultation:
        cs = consultation.get("status")
        if cs == "completed":
            return "awaiting_rx"
        if cs == "in_progress":
            return "in_progress"
        if cs == "waiting":
            return "ready"
    return appt.get("status") or "booked"


def patient_care_bucket(visit_status: str) -> str:
    """Group visits for patient My Care: upcoming | awaiting_rx | past."""
    if visit_status == "completed":
        return "past"
    if visit_status == "awaiting_rx":
        return "awaiting_rx"
    if visit_status == "in_progress":
        return "upcoming"
    if visit_status in ("booked", "ready"):
        return "upcoming"
    return "upcoming"
