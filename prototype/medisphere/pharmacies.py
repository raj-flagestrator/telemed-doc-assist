"""Prototype pharmacy registry — islands, staff accounts, and routing."""

from __future__ import annotations

from medisphere.prescription_ai import all_regimen_stock_lines

# Regional hub (inter-island fulfillment)
DEFAULT_PHARMACY_ID = "pharm-male-central"
PHARM_THAA = "pharm-thaa-vilufushi"
PHARM_ADDU = "pharm-addu-hithadhoo"

PHARMACIES: dict[str, dict] = {
    DEFAULT_PHARMACY_ID: {
        "id": DEFAULT_PHARMACY_ID,
        "name": "Male Central Pharmacy",
        "location": "Malé",
        "type": "hub",
        "islands": [],
    },
    PHARM_THAA: {
        "id": PHARM_THAA,
        "name": "Thaa Atoll Pharmacy",
        "location": "Vilufushi, Thaa Atoll",
        "type": "local",
        "islands": ["thaa"],
    },
    PHARM_ADDU: {
        "id": PHARM_ADDU,
        "name": "Addu Pharmacy",
        "location": "Hithadhoo, Addu City",
        "type": "local",
        "islands": ["addu", "huvadhu", "hithadhoo"],
    },
}

PHARMACY_ACCOUNTS: dict[str, dict[str, str]] = {
    "pharmacist@medisphere.mv": {
        "email": "pharmacist@medisphere.mv",
        "name": "Aminath Shareef",
        "pharmacyId": DEFAULT_PHARMACY_ID,
        "role": "Lead pharmacist",
    },
    "dispatch@medisphere.mv": {
        "email": "dispatch@medisphere.mv",
        "name": "Dispatch Desk",
        "pharmacyId": DEFAULT_PHARMACY_ID,
        "role": "Fulfillment",
    },
    "pharmacist.thaa@medisphere.mv": {
        "email": "pharmacist.thaa@medisphere.mv",
        "name": "Ibrahim Rasheed",
        "pharmacyId": PHARM_THAA,
        "role": "Island pharmacist",
    },
}

_CORE_STOCK: list[dict[str, str | int]] = [
    {"name": "Aspirin", "dosage": "75mg", "quantity": 420, "lowThreshold": 80},
    {"name": "Atorvastatin", "dosage": "20mg", "quantity": 310, "lowThreshold": 60},
    {"name": "Amoxicillin", "dosage": "500mg", "quantity": 95, "lowThreshold": 100},
    {"name": "Paracetamol", "dosage": "500mg", "quantity": 880, "lowThreshold": 150},
    {"name": "Omeprazole", "dosage": "20mg", "quantity": 240, "lowThreshold": 50},
    {"name": "Metformin", "dosage": "500mg", "quantity": 52, "lowThreshold": 75},
    {"name": "Salbutamol inhaler", "dosage": "100mcg", "quantity": 68, "lowThreshold": 40},
    {"name": "Cetirizine", "dosage": "10mg", "quantity": 190, "lowThreshold": 45},
]


def merged_default_stock() -> list[dict[str, str | int]]:
    """Core demo stock plus every AI regimen line (ENT/GI/cardio/etc.) for reserve-stock matching."""
    merged = [dict(item) for item in _CORE_STOCK]
    seen = {(item["name"], item["dosage"]) for item in merged}
    for item in all_regimen_stock_lines():
        key = (item["name"], item["dosage"])
        if key in seen:
            continue
        merged.append(dict(item))
        seen.add(key)
    return merged


DEFAULT_STOCK: list[dict[str, str | int]] = merged_default_stock()


def pharmacy_record(pharmacy_id: str) -> dict:
    return PHARMACIES.get(pharmacy_id, PHARMACIES[DEFAULT_PHARMACY_ID])


def pharmacy_display(pharmacy_id: str) -> str:
    return pharmacy_record(pharmacy_id).get("name", pharmacy_id)


def list_pharmacy_directory() -> list[dict[str, str]]:
    return [
        {
            "email": email,
            "name": account["name"],
            "pharmacyId": account["pharmacyId"],
            "pharmacyName": pharmacy_display(account["pharmacyId"]),
            "role": account["role"],
        }
        for email, account in PHARMACY_ACCOUNTS.items()
    ]


def all_pharmacy_ids() -> list[str]:
    return list(PHARMACIES.keys())
