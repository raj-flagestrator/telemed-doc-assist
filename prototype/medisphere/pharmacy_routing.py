"""Resolve which pharmacy fulfills a prescription from patient island and optional overrides."""

from __future__ import annotations

from medisphere.pharmacies import (
    DEFAULT_PHARMACY_ID,
    PHARMACIES,
    pharmacy_display,
    pharmacy_record,
)

HUB_ROUTING_REASON = "Regional hub in Malé — medicines ship to your island"


def normalize_island_text(island: str | None) -> str:
    if not island:
        return ""
    return island.lower().strip()


def select_pharmacy_for_patient(
    island: str | None,
    *,
    explicit_pharmacy_id: str | None = None,
) -> dict[str, str]:
    """
    Pick a pharmacy for fulfillment.

    - Explicit pharmacyId wins (doctor override).
    - Else match a local pharmacy whose island tokens appear in the patient island string.
    - Else route to the central hub (inter-island delivery).
    """
    if explicit_pharmacy_id and explicit_pharmacy_id in PHARMACIES:
        meta = pharmacy_record(explicit_pharmacy_id)
        return {
            "pharmacyId": explicit_pharmacy_id,
            "pharmacyName": meta["name"],
            "routingReason": "Selected by your doctor",
            "routingMode": "explicit",
        }

    island_text = normalize_island_text(island)

    local_matches: list[tuple[int, str, dict]] = []
    for pharmacy_id, meta in PHARMACIES.items():
        if meta.get("type") == "hub":
            continue
        tokens = meta.get("islands") or []
        score = 0
        for token in tokens:
            t = token.lower()
            if t and t in island_text:
                score = max(score, len(t))
        if score > 0:
            local_matches.append((score, pharmacy_id, meta))

    if local_matches:
        local_matches.sort(key=lambda x: (-x[0], x[1]))
        _, pharmacy_id, meta = local_matches[0]
        return {
            "pharmacyId": pharmacy_id,
            "pharmacyName": meta["name"],
            "routingReason": f"Local pharmacy on {meta['location']} serves your island",
            "routingMode": "local",
        }

    hub = pharmacy_record(DEFAULT_PHARMACY_ID)
    return {
        "pharmacyId": DEFAULT_PHARMACY_ID,
        "pharmacyName": hub["name"],
        "routingReason": HUB_ROUTING_REASON,
        "routingMode": "hub",
    }


def rank_local_pharmacies(
    island: str | None,
    *,
    exclude_pharmacy_ids: set[str] | None = None,
) -> list[tuple[int, str, dict]]:
    """Local pharmacies best-matched to island text, highest score first."""
    exclude = exclude_pharmacy_ids or set()
    island_text = normalize_island_text(island)
    matches: list[tuple[int, str, dict]] = []
    for pharmacy_id, meta in PHARMACIES.items():
        if meta.get("type") == "hub" or pharmacy_id in exclude:
            continue
        score = 0
        for token in meta.get("islands") or []:
            t = token.lower()
            if t and t in island_text:
                score = max(score, len(t))
        if score > 0:
            matches.append((score, pharmacy_id, meta))
    matches.sort(key=lambda x: (-x[0], x[1]))
    return matches


def select_reroute_pharmacy(
    island: str | None,
    *,
    exclude_pharmacy_ids: list[str],
    policy: str = "hub_first",
    hub_enabled: bool = True,
) -> dict[str, str] | None:
    """
    Pick the next pharmacy after a shortage at exclude_pharmacy_ids.

    hub_first — hub if enabled and not excluded, else next nearest local.
    nearest_local_first — next local match, then hub if enabled.
    nearest_local_only — next local only (no hub fallback).
    """
    exclude = set(exclude_pharmacy_ids)
    locals_ranked = rank_local_pharmacies(island, exclude_pharmacy_ids=exclude)

    def _local_result(score: int, pharmacy_id: str, meta: dict) -> dict[str, str]:
        return {
            "pharmacyId": pharmacy_id,
            "pharmacyName": meta["name"],
            "routingReason": (
                f"Rerouted to {meta['name']} ({meta['location']}) — "
                "next nearest pharmacy (decentralized network)"
            ),
            "routingMode": "local",
        }

    def _hub_result() -> dict[str, str]:
        hub = pharmacy_record(DEFAULT_PHARMACY_ID)
        return {
            "pharmacyId": DEFAULT_PHARMACY_ID,
            "pharmacyName": hub["name"],
            "routingReason": (
                "Rerouted to regional hub in Malé — centrally managed network, inter-island fulfillment"
            ),
            "routingMode": "hub",
        }

    if policy == "nearest_local_only":
        if locals_ranked:
            s, pid, meta = locals_ranked[0]
            return _local_result(s, pid, meta)
        return None

    if policy == "nearest_local_first":
        if locals_ranked:
            s, pid, meta = locals_ranked[0]
            return _local_result(s, pid, meta)
        if hub_enabled and DEFAULT_PHARMACY_ID not in exclude:
            return _hub_result()
        return None

    # hub_first
    if hub_enabled and DEFAULT_PHARMACY_ID not in exclude:
        return _hub_result()
    if locals_ranked:
        s, pid, meta = locals_ranked[0]
        return _local_result(s, pid, meta)
    return None


def list_pharmacies_public() -> list[dict]:
    """Directory for UI (patient profile, admin)."""
    items = []
    for pharmacy_id, meta in PHARMACIES.items():
        items.append(
            {
                "id": pharmacy_id,
                "name": meta["name"],
                "location": meta["location"],
                "type": meta.get("type", "local"),
                "islands": meta.get("islands") or [],
                "isHub": meta.get("type") == "hub",
            }
        )
    return sorted(items, key=lambda x: (not x["isHub"], x["name"]))
