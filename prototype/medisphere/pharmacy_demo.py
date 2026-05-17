"""Prototype pharmacy demo data — aligned with prescription-service defaults."""

from __future__ import annotations

import json
import uuid

from medisphere.pharmacies import DEFAULT_PHARMACY_ID, DEFAULT_STOCK, merged_default_stock

# Same regimen as services/prescription_service/app.py DEMO_MEDS
DEMO_MEDICATIONS: list[dict[str, str]] = [
    {"name": "Aspirin", "dosage": "75mg", "frequency": "Once daily", "duration": "30 days"},
    {"name": "Atorvastatin", "dosage": "20mg", "frequency": "Once daily", "duration": "30 days"},
]

DEMO_PATIENT = {
    "full_name": "Amina Hassan",
    "phone": "+9607712345",
    "national_id": "A123456",
    "insurance_id": "AXA-MV-42701",
    "island": "Thaa Atoll · Remote Island",
}

DEMO_PATIENT_ID = uuid.UUID("00000000-0000-4000-8000-000000000101")
DEMO_CONSULTATION_ID = uuid.UUID("00000000-0000-4000-8000-000000000201")
DEMO_PRESCRIPTION_ID = uuid.UUID("00000000-0000-4000-8000-000000000301")
# Fixed UUIDs so re-seeding stays idempotent across restarts.


def medication_summary(medications: list) -> str:
    names: list[str] = []
    for med in medications:
        if isinstance(med, dict):
            name = med.get("name") or ""
        else:
            name = str(med)
        if name:
            names.append(name)
    return ", ".join(names[:3])


async def backfill_pharmacy_routing(pool, tenant_id: str, pharmacy_id: str = DEFAULT_PHARMACY_ID) -> None:
    """Route signed prescriptions that never received a pharmacy_id (legacy rows)."""
    await pool.execute(
        """
        UPDATE prescriptions
        SET status = 'routed', pharmacy_id = $2
        WHERE tenant_id = $1
          AND status = 'signed'
          AND (pharmacy_id IS NULL OR pharmacy_id = '')
        """,
        tenant_id,
        pharmacy_id,
    )


async def ensure_demo_queue_item(pool, tenant_id: str, pharmacy_id: str = DEFAULT_PHARMACY_ID) -> None:
    """One stable demo order so the pharmacy portal is never empty on first load."""
    active = await pool.fetchval(
        """
        SELECT COUNT(*)::int FROM prescriptions p
        LEFT JOIN pharmacy_fulfillments f ON f.prescription_id = p.id
        WHERE p.tenant_id = $1 AND p.pharmacy_id = $2 AND p.status = 'routed'
          AND (f.id IS NULL OR f.status != 'dispatched')
        """,
        tenant_id,
        pharmacy_id,
    )
    if active and active > 0:
        return

    await pool.execute(
        """
        INSERT INTO patients (id, tenant_id, full_name, phone, national_id, insurance_id, island)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          national_id = EXCLUDED.national_id,
          insurance_id = EXCLUDED.insurance_id,
          island = EXCLUDED.island
        """,
        DEMO_PATIENT_ID,
        tenant_id,
        DEMO_PATIENT["full_name"],
        DEMO_PATIENT["phone"],
        DEMO_PATIENT["national_id"],
        DEMO_PATIENT["insurance_id"],
        DEMO_PATIENT["island"],
    )

    await pool.execute(
        """
        INSERT INTO prescriptions (
          id, tenant_id, consultation_id, patient_id, medications, status, pharmacy_id
        )
        VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::jsonb, 'routed', $6)
        ON CONFLICT (id) DO UPDATE SET
          medications = EXCLUDED.medications,
          status = 'routed',
          pharmacy_id = EXCLUDED.pharmacy_id
        """,
        DEMO_PRESCRIPTION_ID,
        tenant_id,
        DEMO_CONSULTATION_ID,
        DEMO_PATIENT_ID,
        json.dumps(DEMO_MEDICATIONS),
        pharmacy_id,
    )

    await pool.execute(
        """
        INSERT INTO pharmacy_fulfillments (
          tenant_id, pharmacy_id, prescription_id, patient_id, status, insurance_status
        )
        VALUES ($1, $2, $3::uuid, $4::uuid, 'queued', 'pending')
        ON CONFLICT (prescription_id) DO NOTHING
        """,
        tenant_id,
        pharmacy_id,
        DEMO_PRESCRIPTION_ID,
        DEMO_PATIENT_ID,
    )


async def ensure_prescription_meds_stock(
    pool, tenant_id: str, pharmacy_id: str, medications: list
) -> None:
    """Ensure stock rows exist for medications on a prescription (prototype-friendly)."""
    await ensure_catalog_stock(pool, tenant_id, pharmacy_id)
    for med in medications:
        if not isinstance(med, dict):
            continue
        name = (med.get("name") or "").strip()
        if not name:
            continue
        dosage = med.get("dosage") or ""
        await pool.execute(
            """
            INSERT INTO pharmacy_stock (
              tenant_id, pharmacy_id, medication_name, dosage, quantity, low_threshold
            )
            VALUES ($1, $2, $3, $4, 25, 5)
            ON CONFLICT (tenant_id, pharmacy_id, medication_name, dosage) DO NOTHING
            """,
            tenant_id,
            pharmacy_id,
            name,
            dosage,
        )


async def ensure_catalog_stock(pool, tenant_id: str, pharmacy_id: str) -> None:
    """Insert any catalog medication missing from this pharmacy (does not reset existing quantities)."""
    for item in merged_default_stock():
        await pool.execute(
            """
            INSERT INTO pharmacy_stock (
              tenant_id, pharmacy_id, medication_name, dosage, quantity, low_threshold
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (tenant_id, pharmacy_id, medication_name, dosage) DO NOTHING
            """,
            tenant_id,
            pharmacy_id,
            item["name"],
            item["dosage"],
            item["quantity"],
            item["lowThreshold"],
        )


async def reset_demo_stock(pool, tenant_id: str, pharmacy_id: str = DEFAULT_PHARMACY_ID) -> None:
    """Keep stock levels in sync with DEFAULT_STOCK (prototype refresh)."""
    for item in merged_default_stock():
        await pool.execute(
            """
            INSERT INTO pharmacy_stock (
              tenant_id, pharmacy_id, medication_name, dosage, quantity, low_threshold
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (tenant_id, pharmacy_id, medication_name, dosage)
            DO UPDATE SET quantity = EXCLUDED.quantity, low_threshold = EXCLUDED.low_threshold
            """,
            tenant_id,
            pharmacy_id,
            item["name"],
            item["dosage"],
            item["quantity"],
            item["lowThreshold"],
        )
