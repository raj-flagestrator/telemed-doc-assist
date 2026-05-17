export interface PrototypePharmacyAccount {
  email: string;
  name: string;
  pharmacyName: string;
  role: string;
}

export const PROTOTYPE_PHARMACY_ACCOUNTS: PrototypePharmacyAccount[] = [
  {
    email: "pharmacist@medisphere.mv",
    name: "Aminath Shareef",
    pharmacyName: "Male Central Pharmacy",
    role: "Lead pharmacist",
  },
  {
    email: "dispatch@medisphere.mv",
    name: "Dispatch Desk",
    pharmacyName: "Male Central Pharmacy",
    role: "Fulfillment",
  },
  {
    email: "pharmacist.thaa@medisphere.mv",
    name: "Ibrahim Rasheed",
    pharmacyName: "Thaa Atoll Pharmacy",
    role: "Island pharmacist",
  },
];

export function mergePharmacyAccounts(
  apiAccounts: Array<{ email: string; name: string; pharmacyName: string; role: string }>
): PrototypePharmacyAccount[] {
  const byEmail = new Map<string, PrototypePharmacyAccount>();
  for (const a of PROTOTYPE_PHARMACY_ACCOUNTS) byEmail.set(a.email, a);
  for (const a of apiAccounts) {
    byEmail.set(a.email, {
      email: a.email,
      name: a.name,
      pharmacyName: a.pharmacyName,
      role: a.role,
    });
  }
  return [...byEmail.values()];
}
