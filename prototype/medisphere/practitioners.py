"""Prototype practitioner directory — shared by booking, identity, triage, and eRx."""

from __future__ import annotations

from typing import TypedDict


class Practitioner(TypedDict):
    id: str
    name: str
    specialty: str


PRACTITIONERS: dict[str, Practitioner] = {
    "prac-cardio-1": {
        "id": "prac-cardio-1",
        "name": "Dr. Aishath Hassan",
        "specialty": "Cardiology",
    },
    "prac-gp-1": {
        "id": "prac-gp-1",
        "name": "Dr. Ibrahim Waheed",
        "specialty": "General Practice",
    },
    "prac-ent-1": {
        "id": "prac-ent-1",
        "name": "Dr. Mariyam Rasheed",
        "specialty": "ENT",
    },
    "prac-gastro-1": {
        "id": "prac-gastro-1",
        "name": "Dr. Ahmed Naeem",
        "specialty": "Gastroenterology",
    },
}

DOCTOR_ACCOUNTS: dict[str, dict[str, str]] = {
    "doctor@medisphere.mv": {
        "practitionerId": "prac-cardio-1",
        "name": "Dr. Aishath Hassan",
        "specialty": "Cardiology",
    },
    "gp@medisphere.mv": {
        "practitionerId": "prac-gp-1",
        "name": "Dr. Ibrahim Waheed",
        "specialty": "General Practice",
    },
    "ent@medisphere.mv": {
        "practitionerId": "prac-ent-1",
        "name": "Dr. Mariyam Rasheed",
        "specialty": "ENT",
    },
    "gastro@medisphere.mv": {
        "practitionerId": "prac-gastro-1",
        "name": "Dr. Ahmed Naeem",
        "specialty": "Gastroenterology",
    },
}

SPECIALTY_ALIASES: dict[str, str] = {
    "cardiology": "Cardiology",
    "cardio": "Cardiology",
    "general practice": "General Practice",
    "gp": "General Practice",
    "general": "General Practice",
    "ent": "ENT",
    "otorhinolaryngology": "ENT",
    "ear nose throat": "ENT",
    "gastroenterology": "Gastroenterology",
    "gastro": "Gastroenterology",
    "gi": "Gastroenterology",
}

SPECIALTY_TO_PRACTITIONER_ID: dict[str, str] = {
    "Cardiology": "prac-cardio-1",
    "General Practice": "prac-gp-1",
    "ENT": "prac-ent-1",
    "Gastroenterology": "prac-gastro-1",
}


def normalize_specialty_label(specialty: str) -> str:
    key = specialty.strip().lower()
    if key in SPECIALTY_ALIASES:
        return SPECIALTY_ALIASES[key]
    for fragment, label in SPECIALTY_ALIASES.items():
        if fragment in key:
            return label
    return specialty.strip() or "General Practice"


def practitioners_for_specialty(specialty: str) -> list[Practitioner]:
    label = normalize_specialty_label(specialty)
    pid = SPECIALTY_TO_PRACTITIONER_ID.get(label)
    if pid and pid in PRACTITIONERS:
        return [PRACTITIONERS[pid]]
    return [PRACTITIONERS["prac-gp-1"]]


def list_doctor_directory() -> list[dict[str, str]]:
    return [
        {"email": email, **profile}
        for email, profile in sorted(DOCTOR_ACCOUNTS.items())
    ]
