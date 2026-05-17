"""Append-only prescription pharmacy routing trail."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _parse_history(raw: Any) -> list[dict]:
    if not raw:
        return []
    if isinstance(raw, str):
        import json

        raw = json.loads(raw)
    return list(raw) if isinstance(raw, list) else []


def routing_history_from_row(row: dict | Any) -> list[dict]:
    if hasattr(row, "get"):
        return _parse_history(row.get("routing_history"))
    return []


def append_routing_event(
    history: list[dict] | Any,
    *,
    event_type: str,
    pharmacy_id: str,
    pharmacy_name: str,
    reason: str,
    routing_mode: str,
    from_pharmacy_id: str | None = None,
    shortage_medications: list[str] | None = None,
    policy: str | None = None,
    actor: str | None = None,
) -> list[dict]:
    events = _parse_history(history)
    event: dict[str, Any] = {
        "at": datetime.now(timezone.utc).isoformat(),
        "type": event_type,
        "pharmacyId": pharmacy_id,
        "pharmacyName": pharmacy_name,
        "reason": reason,
        "routingMode": routing_mode,
    }
    if from_pharmacy_id:
        event["fromPharmacyId"] = from_pharmacy_id
    if shortage_medications:
        event["shortageMedications"] = shortage_medications
    if policy:
        event["policy"] = policy
    if actor:
        event["actor"] = actor
    events.append(event)
    return events
