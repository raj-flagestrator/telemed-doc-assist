export type PrototypeDoctor = {
  email: string;
  name: string;
  specialty: string;
  practitionerId: string;
};

/** Offline fallback — keep in sync with medisphere/practitioners.py DOCTOR_ACCOUNTS. */
/** Union API + fallback lists (API from an old backend must not hide local doctors). */
export function mergeDoctorLists(
  apiDoctors: PrototypeDoctor[],
  fallback: PrototypeDoctor[] = PROTOTYPE_DOCTORS
): PrototypeDoctor[] {
  const byEmail = new Map<string, PrototypeDoctor>();
  for (const d of fallback) {
    byEmail.set(d.email, d);
  }
  for (const d of apiDoctors) {
    byEmail.set(d.email, { ...byEmail.get(d.email), ...d });
  }
  return Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email));
}

export const PROTOTYPE_DOCTORS: PrototypeDoctor[] = [
  {
    email: "doctor@medisphere.mv",
    name: "Dr. Aishath Hassan",
    specialty: "Cardiology",
    practitionerId: "prac-cardio-1",
  },
  {
    email: "ent@medisphere.mv",
    name: "Dr. Mariyam Rasheed",
    specialty: "ENT",
    practitionerId: "prac-ent-1",
  },
  {
    email: "gastro@medisphere.mv",
    name: "Dr. Ahmed Naeem",
    specialty: "Gastroenterology",
    practitionerId: "prac-gastro-1",
  },
  {
    email: "gp@medisphere.mv",
    name: "Dr. Ibrahim Waheed",
    specialty: "General Practice",
    practitionerId: "prac-gp-1",
  },
];
