"""Tests for tenant pharmacy shortage reroute configuration."""

from medisphere.pharmacy_routing import select_reroute_pharmacy
from medisphere.tenant_pharmacy_config import pharmacy_reroute_settings


def test_default_centrally_managed_uses_hub():
    settings = pharmacy_reroute_settings(None)
    assert settings["pharmaciesCentrallyManaged"] is True
    assert settings["pharmacyReroutePolicy"] == "hub_first"
    target = select_reroute_pharmacy(
        "Thaa Atoll · Remote Island",
        exclude_pharmacy_ids=["pharm-thaa-vilufushi"],
        policy=settings["pharmacyReroutePolicy"],
        hub_enabled=settings["pharmacyHubEnabled"],
    )
    assert target is not None
    assert target["pharmacyId"] == "pharm-male-central"
    assert target["routingMode"] == "hub"


def test_decentralized_uses_nearest_local():
    settings = pharmacy_reroute_settings({"pharmaciesCentrallyManaged": False})
    assert settings["pharmaciesCentrallyManaged"] is False
    assert settings["pharmacyReroutePolicy"] == "nearest_local_first"
    target = select_reroute_pharmacy(
        "Hithadhoo, Addu City",
        exclude_pharmacy_ids=["pharm-thaa-vilufushi"],
        policy=settings["pharmacyReroutePolicy"],
        hub_enabled=settings["pharmacyHubEnabled"],
    )
    assert target is not None
    assert target["pharmacyId"] == "pharm-addu-hithadhoo"
    assert target["routingMode"] == "local"
