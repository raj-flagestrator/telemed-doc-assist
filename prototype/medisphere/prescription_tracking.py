"""Human-readable prescription tracking IDs for pharmacy verification."""

from __future__ import annotations

import re

TRACKING_PREFIX = "RX"
_TRACKING_RE = re.compile(r"^RX[- ]?([0-9A-Fa-f]{8})$", re.IGNORECASE)


def tracking_id_from_prescription_id(prescription_id: str) -> str:
    """Stable short code derived from prescription UUID (no extra DB column)."""
    hex_id = prescription_id.replace("-", "").upper()
    return f"{TRACKING_PREFIX}-{hex_id[:8]}"


def tracking_code_from_tracking_id(tracking_id: str) -> str | None:
    """Normalize user input to 8-char hex suffix, or None if invalid."""
    raw = tracking_id.strip().upper()
    match = _TRACKING_RE.match(raw)
    if match:
        return match.group(1).upper()
    if len(raw) == 8 and re.fullmatch(r"[0-9A-F]{8}", raw):
        return raw
    return None


def prescription_id_prefix_sql_param(tracking_id: str) -> str | None:
    """8-char prefix used to match prescription UUIDs in SQL."""
    return tracking_code_from_tracking_id(tracking_id)
