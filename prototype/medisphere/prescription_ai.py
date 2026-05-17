"""Rules-based medication suggestions for doctor review (prototype — not clinical advice)."""

from __future__ import annotations

CARDIO_MEDS = [
    {"name": "Aspirin", "dosage": "75mg", "frequency": "Once daily", "duration": "30 days"},
    {"name": "Atorvastatin", "dosage": "20mg", "frequency": "Once daily", "duration": "30 days"},
    {"name": "Bisoprolol", "dosage": "2.5mg", "frequency": "Once daily", "duration": "30 days"},
]

GP_MEDS = [
    {"name": "Paracetamol", "dosage": "500mg", "frequency": "Every 6 hours PRN", "duration": "5 days"},
    {"name": "Omeprazole", "dosage": "20mg", "frequency": "Once daily before food", "duration": "14 days"},
]

HEADACHE_MEDS = [
    {"name": "Paracetamol", "dosage": "1g", "frequency": "Every 6 hours PRN", "duration": "3 days"},
    {"name": "Ibuprofen", "dosage": "400mg", "frequency": "Every 8 hours with food", "duration": "3 days"},
]

ENT_MEDS = [
    {"name": "Cetirizine", "dosage": "10mg", "frequency": "Once daily", "duration": "7 days"},
    {"name": "Fluticasone nasal spray", "dosage": "2 sprays/nostril", "frequency": "Once daily", "duration": "14 days"},
    {"name": "Paracetamol", "dosage": "500mg", "frequency": "Every 6 hours PRN", "duration": "5 days"},
]

GASTRO_MEDS = [
    {"name": "Omeprazole", "dosage": "20mg", "frequency": "Once daily before breakfast", "duration": "14 days"},
    {"name": "Ondansetron", "dosage": "4mg", "frequency": "Every 8 hours PRN", "duration": "3 days"},
    {"name": "Oral rehydration salts", "dosage": "1 sachet", "frequency": "After each loose stool", "duration": "3 days"},
]


def recommend_medications(
    *,
    symptoms: list[str] | None = None,
    risk_level: str | None = None,
    specialty: str | None = None,
    consultation_notes: str | None = None,
) -> dict:
    symptoms = symptoms or []
    normalized = [s.lower() for s in symptoms]
    joined = " ".join(normalized)
    spec = (specialty or "").lower()

    rationale_parts: list[str] = []
    if symptoms:
        rationale_parts.append(f"Triage symptoms: {', '.join(symptoms)}.")
    if risk_level:
        rationale_parts.append(f"Risk level: {risk_level}.")
    if consultation_notes and consultation_notes.strip():
        rationale_parts.append("Incorporates consultation notes from the video visit.")

    cardio = any(k in joined for k in ("chest", "heart", "palpitation", "breathless", "angina"))
    ent = any(
        k in joined
        for k in ("ear", "throat", "sinus", "hearing", "nasal", "tonsil", "hoarse", "vertigo")
    )
    gastro = any(
        k in joined
        for k in ("stomach", "abdominal", "nausea", "vomit", "diarr", "heartburn", "reflux", "bloat")
    )
    headache = any(k in joined for k in ("headache", "head pain", "migraine"))

    if cardio or "cardio" in spec:
        meds = [dict(m) for m in CARDIO_MEDS]
        if risk_level == "high":
            meds[0]["dosage"] = "150mg"
            rationale_parts.append("Elevated cardio risk — antiplatelet dose adjusted for review.")
        rationale_parts.append("Cardiology-oriented starter regimen (editable before signing).")
    elif ent or spec == "ent" or "otorhinol" in spec:
        meds = [dict(m) for m in ENT_MEDS]
        rationale_parts.append("ENT-oriented supportive regimen (editable before signing).")
    elif gastro or "gastro" in spec:
        meds = [dict(m) for m in GASTRO_MEDS]
        rationale_parts.append("Gastroenterology-oriented starter regimen (editable before signing).")
    elif headache:
        meds = [dict(m) for m in HEADACHE_MEDS]
        rationale_parts.append("Symptom-directed analgesia suggestion.")
    else:
        meds = [dict(m) for m in GP_MEDS]
        rationale_parts.append("General practice supportive therapy suggestion.")

    return {
        "medications": meds,
        "aiRecommended": True,
        "rationale": " ".join(rationale_parts)
        or "Default prototype regimen — adjust before signing.",
    }


_REGIMEN_GROUPS = (CARDIO_MEDS, GP_MEDS, HEADACHE_MEDS, ENT_MEDS, GASTRO_MEDS)


def all_regimen_stock_lines() -> list[dict[str, str | int]]:
    """Unique medication lines from all AI regimens — must match pharmacy_stock name/dosage exactly."""
    seen: set[tuple[str, str]] = set()
    lines: list[dict[str, str | int]] = []
    for group in _REGIMEN_GROUPS:
        for med in group:
            key = (med["name"], med["dosage"])
            if key in seen:
                continue
            seen.add(key)
            lines.append(
                {
                    "name": med["name"],
                    "dosage": med["dosage"],
                    "quantity": 220,
                    "lowThreshold": 45,
                }
            )
    return lines
