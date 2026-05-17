"""Tenant-level pharmacy routing policy (prototype defaults + config merge)."""

from __future__ import annotations

from typing import Any

# When True, stock shortages reroute to the regional hub (centrally managed network).
PHARMACIES_CENTRALLY_MANAGED_DEFAULT = True

DEFAULT_PHARMACY_REROUTE_POLICY = "hub_first"
VALID_REROUTE_POLICIES = frozenset({"hub_first", "nearest_local_first", "nearest_local_only"})


def _coerce_bool(value: object, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def pharmacy_reroute_settings(tenant_config: dict | None) -> dict[str, Any]:
    """
    Resolve shortage reroute behaviour from tenant config.

    pharmaciesCentrallyManaged (default True):
      - True  → route shortages to regional hub (hub_first)
      - False → route to next nearest local pharmacy (nearest_local_first)
    """
    cfg = tenant_config or {}

    centrally_managed = cfg.get("pharmaciesCentrallyManaged")
    if centrally_managed is None:
        # Legacy keys: pharmacyHubEnabled implied central hub routing
        centrally_managed = cfg.get("pharmacyHubEnabled", PHARMACIES_CENTRALLY_MANAGED_DEFAULT)
    centrally_managed = _coerce_bool(centrally_managed, PHARMACIES_CENTRALLY_MANAGED_DEFAULT)

    if centrally_managed:
        policy = "hub_first"
        hub_enabled = True
    else:
        policy = cfg.get("pharmacyReroutePolicy") or "nearest_local_first"
        if policy not in VALID_REROUTE_POLICIES or policy == "hub_first":
            policy = "nearest_local_first"
        hub_enabled = _coerce_bool(cfg.get("pharmacyHubEnabled"), False)

    return {
        "pharmaciesCentrallyManaged": centrally_managed,
        "pharmacyReroutePolicy": policy,
        "pharmacyHubEnabled": hub_enabled,
    }
