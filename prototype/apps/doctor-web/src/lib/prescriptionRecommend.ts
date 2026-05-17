import type { MedicationLine } from "../api";

const CARDIO_MEDS: MedicationLine[] = [
  { name: "Aspirin", dosage: "75mg", frequency: "Once daily", duration: "30 days" },
  { name: "Atorvastatin", dosage: "20mg", frequency: "Once daily", duration: "30 days" },
  { name: "Bisoprolol", dosage: "2.5mg", frequency: "Once daily", duration: "30 days" },
];

const ENT_MEDS: MedicationLine[] = [
  { name: "Cetirizine", dosage: "10mg", frequency: "Once daily", duration: "7 days" },
  {
    name: "Fluticasone nasal spray",
    dosage: "2 sprays/nostril",
    frequency: "Once daily",
    duration: "14 days",
  },
  { name: "Paracetamol", dosage: "500mg", frequency: "Every 6 hours PRN", duration: "5 days" },
];

const GASTRO_MEDS: MedicationLine[] = [
  {
    name: "Omeprazole",
    dosage: "20mg",
    frequency: "Once daily before breakfast",
    duration: "14 days",
  },
  { name: "Ondansetron", dosage: "4mg", frequency: "Every 8 hours PRN", duration: "3 days" },
  {
    name: "Oral rehydration salts",
    dosage: "1 sachet",
    frequency: "After each loose stool",
    duration: "3 days",
  },
];

const HEADACHE_MEDS: MedicationLine[] = [
  { name: "Paracetamol", dosage: "1g", frequency: "Every 6 hours PRN", duration: "3 days" },
  { name: "Ibuprofen", dosage: "400mg", frequency: "Every 8 hours with food", duration: "3 days" },
];

const GP_MEDS: MedicationLine[] = [
  { name: "Paracetamol", dosage: "500mg", frequency: "Every 6 hours PRN", duration: "5 days" },
  { name: "Omeprazole", dosage: "20mg", frequency: "Once daily before food", duration: "14 days" },
];

/** Client fallback when BFF/prescription-service recommend route is missing (stale backend). */
export function recommendMedicationsLocal(input: {
  symptoms: string[];
  riskLevel?: string;
  specialty?: string;
  consultationNotes?: string;
}): { medications: MedicationLine[]; rationale: string; aiRecommended: boolean } {
  const symptoms = input.symptoms ?? [];
  const normalized = symptoms.map((s) => s.toLowerCase());
  const joined = normalized.join(" ");
  const spec = (input.specialty ?? "").toLowerCase();
  const rationaleParts: string[] = [];

  if (symptoms.length) rationaleParts.push(`Triage symptoms: ${symptoms.join(", ")}.`);
  if (input.riskLevel) rationaleParts.push(`Risk level: ${input.riskLevel}.`);
  if (input.consultationNotes?.trim()) {
    rationaleParts.push("Incorporates consultation notes from the video visit.");
  }

  const cardio = ["chest", "heart", "palpitation", "breathless", "angina"].some((k) => joined.includes(k));
  const ent = ["ear", "throat", "sinus", "hearing", "nasal", "tonsil", "hoarse", "vertigo"].some((k) =>
    joined.includes(k)
  );
  const gastro = ["stomach", "abdominal", "nausea", "vomit", "diarr", "heartburn", "reflux", "bloat"].some(
    (k) => joined.includes(k)
  );
  const headache = ["headache", "head pain", "migraine"].some((k) => joined.includes(k));

  let medications: MedicationLine[];

  if (cardio || spec.includes("cardio")) {
    medications = CARDIO_MEDS.map((m) => ({ ...m }));
    if (input.riskLevel === "high" && medications[0]) {
      medications[0] = { ...medications[0], dosage: "150mg" };
      rationaleParts.push("Elevated cardio risk — antiplatelet dose adjusted for review.");
    }
    rationaleParts.push("Cardiology-oriented starter regimen (editable before signing).");
  } else if (ent || spec === "ent" || spec.includes("otorhinol")) {
    medications = ENT_MEDS.map((m) => ({ ...m }));
    rationaleParts.push("ENT-oriented supportive regimen (editable before signing).");
  } else if (gastro || spec.includes("gastro")) {
    medications = GASTRO_MEDS.map((m) => ({ ...m }));
    rationaleParts.push("Gastroenterology-oriented starter regimen (editable before signing).");
  } else if (headache) {
    medications = HEADACHE_MEDS.map((m) => ({ ...m }));
    rationaleParts.push("Symptom-directed analgesia suggestion.");
  } else {
    medications = GP_MEDS.map((m) => ({ ...m }));
    rationaleParts.push("General practice supportive therapy suggestion.");
  }

  return {
    medications,
    aiRecommended: true,
    rationale:
      rationaleParts.join(" ") ||
      "Default prototype regimen (offline fallback) — adjust before signing.",
  };
}
