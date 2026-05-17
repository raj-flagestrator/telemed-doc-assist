export const SYMPTOM_CHIPS = [
  "chest pain",
  "breathlessness",
  "palpitation",
  "sore throat",
  "ear pain",
  "sinus pressure",
  "abdominal pain",
  "nausea",
  "heartburn",
  "fatigue",
  "mild headache",
] as const;

const CHIP_ALIASES: Record<string, readonly string[]> = {
  "chest pain": ["chest pain", "chest pressure", "chest tightness", "angina"],
  breathlessness: ["breathless", "breathlessness", "shortness of breath", "sob", "can't breathe"],
  palpitation: ["palpitation", "racing heart", "heart racing", "flutter"],
  fatigue: ["fatigue", "tired", "exhausted", "weak"],
  "mild headache": ["headache", "head pain"],
  "sore throat": ["sore throat", "throat pain", "swallowing pain", "tonsill"],
  "ear pain": ["ear pain", "earache", "ear ache", "blocked ear"],
  "sinus pressure": ["sinus", "nasal congestion", "blocked nose", "runny nose"],
  "abdominal pain": ["abdominal", "stomach pain", "belly pain", "tummy"],
  nausea: ["nausea", "queasy", "feeling sick"],
  heartburn: ["heartburn", "acid reflux", "reflux", "indigestion"],
};

const SEVERITY_WORDS = ["severe", "worst", "crushing", "radiating", "emergency", "unbearable"];

const SYMPTOM_SPECIALTY: Record<string, string> = {
  "chest pain": "Cardiology",
  breathlessness: "Cardiology",
  palpitation: "Cardiology",
  "ear pain": "ENT",
  "sore throat": "ENT",
  "sinus pressure": "ENT",
  "abdominal pain": "Gastroenterology",
  nausea: "Gastroenterology",
  heartburn: "Gastroenterology",
  fatigue: "General Practice",
  "mild headache": "General Practice",
};

const SPECIALTY_PRIORITY = ["Cardiology", "ENT", "Gastroenterology", "General Practice"] as const;

function mentionsChest(text: string): boolean {
  return /(chest pain|chest pressure|chest tightness|angina|\bchest\b)/i.test(text);
}

function mentionsEnt(text: string): boolean {
  return /(ear pain|earache|sore throat|sinus pressure|\bear\b|\bthroat\b|sinus|tonsil|hearing|nasal)/i.test(
    text
  );
}

function mentionsGastro(text: string): boolean {
  return /(abdominal pain|stomach|nausea|vomit|diarr|heartburn|reflux|indigest|belly|tummy)/i.test(
    text
  );
}

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

export function newMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeSymptom(text: string): string {
  const lower = text.toLowerCase().trim();
  if (!lower) return text.trim();
  if (lower in CHIP_ALIASES) return lower;

  let bestLabel: string | null = null;
  let bestLen = 0;
  for (const [label, aliases] of Object.entries(CHIP_ALIASES)) {
    if (lower === label || aliases.includes(lower)) return label;
    for (const phrase of [label, ...aliases]) {
      if (lower.includes(phrase) && phrase.length > bestLen) {
        bestLen = phrase.length;
        bestLabel = label;
      }
    }
  }
  return bestLabel ?? text.trim();
}

export function mergeSymptoms(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...existing, ...incoming]) {
    const normalized = normalizeSymptom(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(normalized);
    }
  }
  return merged;
}

function priorSymptoms(symptoms: string[], userMessage?: string): string[] {
  const merged = mergeSymptoms(symptoms, []);
  if (!userMessage) return merged;
  const keyMsg = normalizeSymptom(userMessage).toLowerCase();
  let removed = false;
  const out: string[] = [];
  for (const s of merged) {
    if (!removed && s.toLowerCase() === keyMsg) {
      removed = true;
      continue;
    }
    out.push(s);
  }
  return removed ? out : merged;
}

function replyToShortAnswer(userMessage: string): string | null {
  const msg = userMessage.toLowerCase().trim();
  const negatives = ["no", "none", "nope", "not really", "nah"];
  if (negatives.some((n) => msg === n || msg.startsWith(`${n} `))) {
    return (
      "Understood — thanks for clarifying. " +
      "Add any other symptoms with the labels below, or tap Get assessment when you're ready."
    );
  }
  const positives = ["yes", "yeah", "yep"];
  if (positives.some((p) => msg === p || msg.startsWith(`${p} `))) {
    return (
      "Please describe what you're experiencing (e.g. breathlessness, sweating) so I can note it."
    );
  }
  const associated = ["sweat", "breath", "arm", "jaw", "radiat", "dizz", "faint", "swelling"];
  if (associated.some((w) => msg.includes(w))) {
    return (
      "I've noted that detail — thank you. " +
      "Any other symptoms, or tap Get assessment for a recommendation."
    );
  }
  return null;
}

export function greetingMessage(): string {
  return (
    "Hello — I'm your MediSphere triage assistant. " +
    "Tell me what you're feeling today. You can tap the symptom labels below or type in your own words."
  );
}

/** Mirrors backend rules when /triage/chat is unavailable (e.g. stale BFF). */
export function chatReply(symptoms: string[], userMessage?: string): string {
  const merged = mergeSymptoms(symptoms, []);
  const prior = priorSymptoms(symptoms, userMessage);
  const priorKeys = new Set(prior.map((s) => s.toLowerCase()));
  const newSymptoms = merged.filter((s) => !priorKeys.has(s.toLowerCase()));

  const lowerAll = merged.join(" ").toLowerCase();
  const lowerNew = newSymptoms.join(" ").toLowerCase();

  if (!merged.length) {
    return "Please share at least one symptom — select a label or describe how you feel.";
  }

  if (userMessage && SEVERITY_WORDS.some((w) => userMessage.toLowerCase().includes(w))) {
    return (
      "Thank you for telling me. Severe symptoms need prompt attention. " +
      "I'll factor that into your assessment. Any other symptoms to add?"
    );
  }

  if (userMessage) {
    const short = replyToShortAnswer(userMessage);
    if (short) return short;
  }

  if (mentionsEnt(lowerNew)) {
    return (
      "I've noted ear, nose, or throat symptoms. " +
      "Any fever, hearing loss, or difficulty swallowing?"
    );
  }

  if (mentionsGastro(lowerNew)) {
    return (
      "I've noted digestive symptoms. " +
      "Any blood in vomit or stool, severe pain, or signs of dehydration?"
    );
  }

  if (mentionsChest(lowerNew) && !lowerAll.includes("breath")) {
    return (
      "I've noted chest-related symptoms. " +
      "Are you also experiencing breathlessness, sweating, or pain spreading to your arm or jaw?"
    );
  }

  if (lowerNew.includes("breath") && !mentionsChest(lowerAll)) {
    return (
      "I've noted breathing difficulty. " +
      "Did this start suddenly, and do you have chest pain or swelling in your legs?"
    );
  }

  if (lowerNew.includes("palpitation")) {
    return (
      "I've noted palpitations. " +
      "How long has this been happening? Any dizziness, chest pain, or fainting?"
    );
  }

  if (newSymptoms.length > 0) {
    const added = newSymptoms.join(", ");
    if (merged.length === 1) {
      return (
        `Got it — ${added} recorded. ` +
        "You can add more symptoms using the labels, or tap Get assessment when ready."
      );
    }
    return (
      `Got it — I've added ${added}. So far: ${merged.join(", ")}. ` +
      "Add more or tap Get assessment when ready."
    );
  }

  if (merged.length === 1) {
    return (
      `Got it — ${merged[0]} recorded. ` +
      "You can add more symptoms using the labels, or tap Get assessment when ready."
    );
  }

  return (
    `Thank you. I've recorded ${merged.length} symptom(s): ${merged.join(", ")}. ` +
    "Add anything else, or tap Get assessment for a recommendation."
  );
}

export function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.message === "Not Found";
}

function scoreSpecialties(symptoms: string[]): Record<string, number> {
  const merged = mergeSymptoms(symptoms, []);
  const scores: Record<string, number> = {
    Cardiology: 0,
    ENT: 0,
    Gastroenterology: 0,
    "General Practice": 0,
  };
  for (const raw of merged) {
    const label = normalizeSymptom(raw).toLowerCase();
    if (label in SYMPTOM_SPECIALTY) {
      const spec = SYMPTOM_SPECIALTY[label];
      scores[spec] = (scores[spec] ?? 0) + 1;
      continue;
    }
    if (mentionsEnt(label)) scores.ENT += 1;
    else if (mentionsGastro(label)) scores.Gastroenterology += 1;
    else if (mentionsChest(label) || label.includes("breath") || label.includes("palpitation")) {
      scores.Cardiology += 1;
    } else scores["General Practice"] += 1;
  }
  return scores;
}

export function recommendSpecialty(symptoms: string[]): string {
  const scores = scoreSpecialties(symptoms);
  const best = Math.max(...Object.values(scores));
  if (best === 0) return "General Practice";
  for (const name of SPECIALTY_PRIORITY) {
    if (scores[name] === best) return name;
  }
  return "General Practice";
}

/** Local assessment — do not rely on stale ai-triage-service (cardio/GP only). */
export function assessSymptoms(symptoms: string[]): Record<string, unknown> {
  const scores = scoreSpecialties(symptoms);
  const cardioHits = scores.Cardiology;
  const entHits = scores.ENT;
  const gastroHits = scores.Gastroenterology;
  const specialtyHits = cardioHits + entHits + gastroHits;
  const normalized = mergeSymptoms(symptoms, []);

  let riskScore = Math.min(100, 20 + specialtyHits * 18);
  if (normalized.some((s) => s.toLowerCase().includes("severe"))) {
    riskScore = Math.min(100, riskScore + 20);
  }
  const riskLevel = riskScore >= 70 ? "high" : riskScore >= 45 ? "medium" : "low";
  const recommendedSpecialty = recommendSpecialty(symptoms);
  const recommendedAction =
    riskLevel === "high"
      ? "Book urgent teleconsultation within 24 hours"
      : riskLevel === "medium"
        ? "Book specialist consultation this week"
        : "Self-care guidance; book GP if symptoms persist";

  return {
    riskScore,
    riskLevel,
    recommendedSpecialty,
    recommendedAction,
    explanation: `Rules-based triage analyzed ${symptoms.length} symptom(s). Cardio: ${cardioHits}, ENT: ${entHits}, Gastro: ${gastroHits}. Advisory only — not a diagnosis.`,
  };
}

export function assessmentMessages(result: Record<string, unknown>): string[] {
  const level = String(result.riskLevel ?? "low");
  const specialty = String(result.recommendedSpecialty ?? "General Practice");
  const action = String(result.recommendedAction ?? "");
  const score = result.riskScore ?? 0;
  return [
    `Based on what you've shared, your preliminary risk level is ${level} (score ${score}/100).`,
    `I recommend a ${specialty} consultation. ${action}`,
    "This is advisory only — not a medical diagnosis. A clinician will confirm during your teleconsult.",
  ];
}
