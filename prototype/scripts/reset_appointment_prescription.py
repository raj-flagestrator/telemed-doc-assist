# -*- coding: utf-8 -*-
"""
Remove prescriptions (and pharmacy fulfillments) for an appointment so the doctor can re-sign.

Usage:
  python scripts/reset_appointment_prescription.py a4d2802e-5d7a-4c1d-91b8-fb152936e66d
"""
from __future__ import annotations

import asyncio
import sys

from medisphere.db import close_pool, get_pool, run_migrations


async def main(appointment_id: str) -> None:
    await run_migrations("prescription-service", """
    CREATE TABLE IF NOT EXISTS prescriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      consultation_id UUID NOT NULL,
      patient_id UUID NOT NULL,
      medications JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'signed',
      pharmacy_id TEXT,
      signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """)
    pool = await get_pool()
    consult = await pool.fetchrow(
        "SELECT id FROM consultations WHERE appointment_id = $1::uuid LIMIT 1",
        appointment_id,
    )
    if not consult:
        print(f"No consultation for appointment {appointment_id}")
        await close_pool()
        return
    cid = str(consult["id"])
    rx_rows = await pool.fetch(
        "SELECT id FROM prescriptions WHERE consultation_id = $1::uuid",
        cid,
    )
    for rx in rx_rows:
        rx_id = str(rx["id"])
        await pool.execute(
            "DELETE FROM prescription_notifications WHERE prescription_id = $1::uuid",
            rx_id,
        )
        await pool.execute(
            "DELETE FROM fulfillments WHERE prescription_id = $1::uuid",
            rx_id,
        )
        await pool.execute(
            "DELETE FROM deliveries WHERE prescription_id = $1::uuid",
            rx_id,
        )
        await pool.execute("DELETE FROM prescriptions WHERE id = $1::uuid", rx_id)
        print(f"Deleted prescription {rx_id}")
    print(f"Reset complete for consultation {cid} (appointment {appointment_id})")
    await close_pool()


if __name__ == "__main__":
    appt = sys.argv[1] if len(sys.argv) > 1 else "a4d2802e-5d7a-4c1d-91b8-fb152936e66d"
    asyncio.run(main(appt))
