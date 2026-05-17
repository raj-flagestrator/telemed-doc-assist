"""Match prescriptions and consultations to appointments for care summary views."""

from __future__ import annotations


def _iso_key(value: str | None) -> str:
    return value or ""


def latest_consultation_by_appointment(consultations: list[dict]) -> dict[str, dict]:
    """One consultation per appointment — prefer most recently created."""
    by_appt: dict[str, dict] = {}
    for c in sorted(consultations, key=lambda x: _iso_key(x.get("createdAt")), reverse=True):
        aid = c.get("appointmentId")
        if aid and aid not in by_appt:
            by_appt[aid] = c
    return by_appt


def latest_prescription_by_consultation(prescriptions: list[dict]) -> dict[str, dict]:
    """One prescription per consultation — prefer most recently signed."""
    by_consult: dict[str, dict] = {}
    for r in sorted(prescriptions, key=lambda x: _iso_key(x.get("signedAt")), reverse=True):
        cid = r.get("consultationId")
        if cid and cid not in by_consult:
            by_consult[cid] = r
    return by_consult


def latest_prescription_by_appointment(prescriptions: list[dict]) -> dict[str, dict]:
    """One prescription per appointment — prefer most recently signed."""
    by_appt: dict[str, dict] = {}
    for r in sorted(prescriptions, key=lambda x: _iso_key(x.get("signedAt")), reverse=True):
        aid = r.get("appointmentId")
        if aid and aid not in by_appt:
            by_appt[aid] = r
    return by_appt


def prescription_for_appointment(
    appointment_id: str,
    prescriptions: list[dict],
    *,
    by_appointment: dict[str, dict] | None = None,
    by_consultation: dict[str, dict] | None = None,
    consultation_id: str | None = None,
) -> dict | None:
    """Resolve the best prescription for a visit (appointment-first)."""
    by_appt = by_appointment if by_appointment is not None else latest_prescription_by_appointment(
        prescriptions
    )
    rx = by_appt.get(appointment_id)
    if rx:
        return rx
    if consultation_id:
        by_consult = (
            by_consultation
            if by_consultation is not None
            else latest_prescription_by_consultation(prescriptions)
        )
        return by_consult.get(consultation_id)
    return None
