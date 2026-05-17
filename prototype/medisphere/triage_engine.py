import re

from medisphere.practitioners import normalize_specialty_label

CARDIO_KEYWORDS = ("chest", "heart", "palpitation", "breathless", "breathlessness", "angina")
ENT_KEYWORDS = (
    "ear",
    "throat",
    "sinus",
    "hearing",
    "nasal",
    "nose",
    "tonsil",
    "hoarse",
    "vertigo",
    "sore throat",
    "blocked nose",
    "earache",
)
GASTRO_KEYWORDS = (
    "stomach",
    "abdominal",
    "abdomen",
    "nausea",
    "vomit",
    "diarr",
    "heartburn",
    "reflux",
    "bloat",
    "indigest",
    "constipat",
    "acid",
)
SEVERITY_WORDS = ("severe", "worst", "crushing", "radiating", "emergency", "unbearable")

# Direct chip → specialty (avoids "heart" in "heartburn" counting as cardiology).
SYMPTOM_SPECIALTY: dict[str, str] = {
    "chest pain": "Cardiology",
    "breathlessness": "Cardiology",
    "palpitation": "Cardiology",
    "ear pain": "ENT",
    "sore throat": "ENT",
    "sinus pressure": "ENT",
    "abdominal pain": "Gastroenterology",
    "nausea": "Gastroenterology",
    "heartburn": "Gastroenterology",
    "fatigue": "General Practice",
    "mild headache": "General Practice",
}

SPECIALTY_PRIORITY = ("Cardiology", "ENT", "Gastroenterology", "General Practice")

CHIP_ALIASES: dict[str, tuple[str, ...]] = {
    "chest pain": ("chest pain", "chest pressure", "chest tightness", "angina"),
    "breathlessness": ("breathless", "breathlessness", "shortness of breath", "sob", "can't breathe"),
    "palpitation": ("palpitation", "racing heart", "heart racing", "flutter"),
    "fatigue": ("fatigue", "tired", "exhausted", "weak"),
    "mild headache": ("headache", "head pain"),
    "sore throat": ("sore throat", "throat pain", "swallowing pain", "tonsill"),
    "ear pain": ("ear pain", "earache", "ear ache", "blocked ear"),
    "sinus pressure": ("sinus", "nasal congestion", "blocked nose", "runny nose"),
    "abdominal pain": ("abdominal", "stomach pain", "belly pain", "tummy"),
    "nausea": ("nausea", "queasy", "feeling sick"),
    "heartburn": ("heartburn", "acid reflux", "reflux", "indigestion"),
}


def normalize_symptom(text: str) -> str:
    """Map free text to a chip label; longest phrase wins to avoid 'pain' matching 'ear pain'."""
    lower = text.lower().strip()
    if not lower:
        return text.strip()
    if lower in CHIP_ALIASES:
        return lower

    best_label: str | None = None
    best_len = 0
    for label, aliases in CHIP_ALIASES.items():
        if lower == label or lower in aliases:
            return label
        for phrase in (label, *aliases):
            if phrase in lower and len(phrase) > best_len:
                best_len = len(phrase)
                best_label = label

    return best_label if best_label else text.strip()


def _mentions_chest(text: str) -> bool:
    return bool(
        re.search(r"(chest pain|chest pressure|chest tightness|angina|\bchest\b)", text, re.I)
    )


def _mentions_ent(text: str) -> bool:
    return bool(
        re.search(
            r"(ear pain|earache|sore throat|sinus pressure|\bear\b|\bthroat\b|sinus|tonsil|hearing|nasal)",
            text,
            re.I,
        )
    )


def _mentions_gastro(text: str) -> bool:
    return bool(
        re.search(
            r"(abdominal pain|stomach|nausea|vomit|diarr|heartburn|reflux|indigest|belly|tummy)",
            text,
            re.I,
        )
    )


def merge_symptoms(existing: list[str], incoming: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for item in [*existing, *incoming]:
        normalized = normalize_symptom(item)
        if not normalized:
            continue
        key = normalized.lower()
        if key not in seen:
            seen.add(key)
            merged.append(normalized)
    return merged


def _score_specialties(symptoms: list[str]) -> dict[str, int]:
    merged = merge_symptoms(symptoms, [])
    scores = {name: 0 for name in SPECIALTY_PRIORITY}
    for raw in merged:
        label = normalize_symptom(raw).lower()
        if label in SYMPTOM_SPECIALTY:
            scores[SYMPTOM_SPECIALTY[label]] += 1
            continue
        text = label
        if _mentions_ent(text):
            scores["ENT"] += 1
        elif _mentions_gastro(text):
            scores["Gastroenterology"] += 1
        elif _mentions_chest(text) or "breath" in text or "palpitation" in text:
            scores["Cardiology"] += 1
        else:
            scores["General Practice"] += 1
    return scores


def recommend_specialty(symptoms: list[str]) -> str:
    scores = _score_specialties(symptoms)
    best = max(scores.values())
    if best == 0:
        return "General Practice"
    for name in SPECIALTY_PRIORITY:
        if scores[name] == best:
            return name
    return "General Practice"


def assess_symptoms(symptoms: list[str]) -> dict:
    merged = merge_symptoms(symptoms, [])
    scores = _score_specialties(symptoms)
    cardio_hits = scores["Cardiology"]
    ent_hits = scores["ENT"]
    gastro_hits = scores["Gastroenterology"]
    specialty_hits = cardio_hits + ent_hits + gastro_hits

    risk_score = min(
        100,
        20 + specialty_hits * 18 + (20 if any("severe" in s.lower() for s in merged) else 0),
    )
    if risk_score >= 70:
        risk_level = "high"
    elif risk_score >= 45:
        risk_level = "medium"
    else:
        risk_level = "low"

    recommended_specialty = normalize_specialty_label(recommend_specialty(symptoms))
    if risk_level == "high":
        action = "Book urgent teleconsultation within 24 hours"
    elif risk_level == "medium":
        action = "Book specialist consultation this week"
    else:
        action = "Self-care guidance; book GP if symptoms persist"

    return {
        "riskScore": risk_score,
        "riskLevel": risk_level,
        "recommendedSpecialty": recommended_specialty,
        "recommendedAction": action,
        "explanation": (
            f"Rules-based triage analyzed {len(symptoms)} symptom(s). "
            f"Cardio: {cardio_hits}, ENT: {ent_hits}, Gastro: {gastro_hits}. Advisory only — not a diagnosis."
        ),
    }


def greeting_message() -> str:
    return (
        "Hello — I'm your MediSphere triage assistant. "
        "Tell me what you're feeling today. You can tap the symptom labels below or type in your own words."
    )


def prior_symptoms(symptoms: list[str], user_message: str | None) -> list[str]:
    """Symptom list before the current user turn (symptoms already includes this turn)."""
    merged = merge_symptoms(symptoms, [])
    if not user_message:
        return merged
    norm_msg = normalize_symptom(user_message)
    key_msg = norm_msg.lower()
    out: list[str] = []
    removed = False
    for s in merged:
        if not removed and s.lower() == key_msg:
            removed = True
            continue
        out.append(s)
    return out if removed else merged


def reply_to_short_answer(user_message: str) -> str | None:
    msg = user_message.lower().strip()
    negatives = ("no", "none", "nope", "not really", "nah")
    if any(msg == n or msg.startswith(f"{n} ") for n in negatives):
        return (
            "Understood — thanks for clarifying. "
            "Add any other symptoms with the labels below, or tap **Get assessment** when you're ready."
        )
    positives = ("yes", "yeah", "yep")
    if any(msg == p or msg.startswith(f"{p} ") for p in positives):
        return (
            "Please describe what you're experiencing (e.g. breathlessness, ear pain, nausea) "
            "so I can note it."
        )
    associated = ("sweat", "breath", "arm", "jaw", "radiat", "dizz", "faint", "swelling")
    if any(w in msg for w in associated):
        return (
            "I've noted that detail — thank you. "
            "Any other symptoms, or tap **Get assessment** for a recommendation."
        )
    return None


def chat_reply(symptoms: list[str], user_message: str | None = None) -> str:
    merged = merge_symptoms(symptoms, [])
    prior = prior_symptoms(symptoms, user_message)
    prior_keys = {s.lower() for s in prior}
    new_symptoms = [s for s in merged if s.lower() not in prior_keys]

    lower_all = " ".join(merged).lower()
    lower_new = " ".join(new_symptoms).lower()

    if not merged:
        return "Please share at least one symptom — select a label or describe how you feel."

    if user_message and any(w in user_message.lower() for w in SEVERITY_WORDS):
        return (
            "Thank you for telling me. Severe symptoms need prompt attention. "
            "I'll factor that into your assessment. Any other symptoms to add?"
        )

    if user_message:
        short = reply_to_short_answer(user_message)
        if short:
            return short

    if _mentions_ent(lower_new):
        return (
            "I've noted ear, nose, or throat symptoms. "
            "Any fever, hearing loss, or difficulty swallowing?"
        )

    if _mentions_gastro(lower_new):
        return (
            "I've noted digestive symptoms. "
            "Any blood in vomit or stool, severe pain, or signs of dehydration?"
        )

    if _mentions_chest(lower_new) and "breath" not in lower_all:
        return (
            "I've noted chest-related symptoms. "
            "Are you also experiencing breathlessness, sweating, or pain spreading to your arm or jaw?"
        )

    if "breath" in lower_new and not _mentions_chest(lower_all):
        return (
            "I've noted breathing difficulty. "
            "Did this start suddenly, and do you have chest pain or swelling in your legs?"
        )

    if "palpitation" in lower_new:
        return (
            "I've noted palpitations. "
            "How long has this been happening? Any dizziness, chest pain, or fainting?"
        )

    if new_symptoms:
        added = ", ".join(new_symptoms)
        if len(merged) == 1:
            return (
                f"Got it — {added} recorded. "
                "You can add more symptoms using the labels, or tap **Get assessment** when ready."
            )
        return (
            f"Got it — I've added {added}. "
            f"So far: {', '.join(merged)}. Add more or tap **Get assessment** when ready."
        )

    if len(merged) == 1:
        return (
            f"Got it — {merged[0]} recorded. "
            "You can add more symptoms using the labels, or tap **Get assessment** when ready."
        )

    return (
        f"Thank you. I've recorded {len(merged)} symptom(s): {', '.join(merged)}. "
        "Add anything else, or tap **Get assessment** for a recommendation."
    )


def assessment_chat_messages(result: dict) -> list[str]:
    level = str(result.get("riskLevel", "low"))
    specialty = str(result.get("recommendedSpecialty", "General Practice"))
    action = str(result.get("recommendedAction", ""))
    score = result.get("riskScore", 0)

    return [
        f"Based on what you've shared, your preliminary risk level is {level} (score {score}/100).",
        f"I recommend a {specialty} consultation. {action}",
        "This is advisory only — not a medical diagnosis. A clinician will confirm during your teleconsult.",
    ]
