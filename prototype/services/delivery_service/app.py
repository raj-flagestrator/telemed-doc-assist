from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from medisphere.app_factory import create_app
from medisphere.auth import require_auth
from medisphere.db import close_pool, get_pool, run_migrations
from medisphere.pharmacies import DEFAULT_PHARMACY_ID, pharmacy_display

MIGRATION = """
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  prescription_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pharmacy_name TEXT NOT NULL,
  eta_minutes INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

MIGRATION_V2 = """
UPDATE deliveries d
SET status = 'pending'
WHERE d.status = 'preparing'
  AND NOT EXISTS (
    SELECT 1 FROM pharmacy_fulfillments f
    WHERE f.prescription_id = d.prescription_id
      AND f.status IN ('preparing', 'ready_for_dispatch', 'dispatched')
  );
"""

ORDER = ["preparing", "dispatched", "in_transit", "delivered"]
STEPS = [
    "Prescription received",
    "Medicines prepared",
    "Dispatched from Male",
    "In transit to island",
    "Delivered",
]
STATUS_INDEX = {"pending": 0, "preparing": 1, "dispatched": 2, "in_transit": 3, "delivered": 4}


def tracking_steps(status: str) -> list[dict]:
    idx = STATUS_INDEX.get(status, 1)
    now = datetime.now(timezone.utc)
    return [
        {
            "label": label,
            "at": (now - timedelta(hours=len(STEPS) - i)).isoformat(),
            "completed": i <= idx,
        }
        for i, label in enumerate(STEPS)
    ]


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("delivery-service", MIGRATION)
    await run_migrations("delivery-service-v2", MIGRATION_V2)
    yield
    await close_pool()


app = create_app(name="delivery-service", lifespan=lifespan)


class DeliveryCreate(BaseModel):
    prescriptionId: str


@app.post("/api/v1/deliveries")
async def create_delivery(body: DeliveryCreate, auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    rx_row = await pool.fetchrow(
        """
        SELECT pharmacy_id, status, patient_id::text
        FROM prescriptions
        WHERE id = $1::uuid AND tenant_id = $2
        """,
        body.prescriptionId,
        auth["tenantId"],
    )
    if not rx_row:
        raise HTTPException(404, "Prescription not found")
    if str(rx_row["patient_id"]) != str(patient_id):
        raise HTTPException(403, "Forbidden")
    if rx_row["status"] not in ("routed", "fulfilled"):
        raise HTTPException(
            400,
            "Choose a pharmacy and place your order before tracking delivery",
        )
    if not rx_row["pharmacy_id"]:
        raise HTTPException(400, "No pharmacy selected for this prescription")
    pharmacy_id = rx_row["pharmacy_id"]
    pharmacy_name = pharmacy_display(pharmacy_id)
    row = await pool.fetchrow(
        """
        INSERT INTO deliveries (tenant_id, prescription_id, patient_id, status, pharmacy_name, eta_minutes)
        VALUES ($1, $2::uuid, $3::uuid, 'pending', $4, 180) RETURNING id
        """,
        auth["tenantId"],
        body.prescriptionId,
        patient_id,
        pharmacy_name,
    )
    return {
        "deliveryId": str(row["id"]),
        "status": "pending",
        "pharmacyName": pharmacy_name,
        "etaMinutes": 180,
    }


@app.get("/api/v1/deliveries/patient/me")
async def list_patient_deliveries(auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, prescription_id, status, pharmacy_name, eta_minutes, created_at
        FROM deliveries
        WHERE tenant_id = $1 AND patient_id = $2::uuid
        ORDER BY created_at DESC
        """,
        auth["tenantId"],
        patient_id,
    )
    return {
        "deliveries": [
            {
                "id": str(r["id"]),
                "prescriptionId": str(r["prescription_id"]),
                "status": r["status"],
                "pharmacyName": r["pharmacy_name"],
                "etaMinutes": r["eta_minutes"],
                "createdAt": r["created_at"].isoformat(),
            }
            for r in rows
        ]
    }


@app.get("/api/v1/deliveries/by-prescription/{prescription_id}")
async def get_by_prescription(prescription_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, prescription_id, status, pharmacy_name, eta_minutes, created_at
        FROM deliveries
        WHERE prescription_id = $1::uuid AND tenant_id = $2
        ORDER BY created_at DESC LIMIT 1
        """,
        prescription_id,
        auth["tenantId"],
    )
    if not row:
        return {"delivery": None}
    return {
        "delivery": {
            "id": str(row["id"]),
            "prescriptionId": str(row["prescription_id"]),
            "status": row["status"],
            "pharmacyName": row["pharmacy_name"],
            "etaMinutes": row["eta_minutes"],
            "createdAt": row["created_at"].isoformat(),
        }
    }


async def _effective_delivery_status(pool, prescription_id: str, stored_status: str) -> str:
    if stored_status in ("dispatched", "in_transit", "delivered"):
        return stored_status
    f_row = await pool.fetchrow(
        """
        SELECT status FROM pharmacy_fulfillments
        WHERE prescription_id = $1::uuid
        """,
        prescription_id,
    )
    if not f_row:
        return stored_status
    if f_row["status"] in ("preparing", "ready_for_dispatch"):
        return "preparing"
    if f_row["status"] == "dispatched":
        return "dispatched"
    return stored_status if stored_status != "preparing" else "pending"


@app.get("/api/v1/deliveries/{delivery_id}")
async def get_delivery(delivery_id: str, _auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM deliveries WHERE id = $1::uuid", delivery_id)
    if not row:
        raise HTTPException(404, "Not found")
    status = await _effective_delivery_status(pool, str(row["prescription_id"]), row["status"])
    return {
        "id": str(row["id"]),
        "prescriptionId": str(row["prescription_id"]),
        "status": status,
        "pharmacyName": row["pharmacy_name"],
        "etaMinutes": row["eta_minutes"],
        "trackingSteps": tracking_steps(status),
    }


@app.post("/api/v1/deliveries/{delivery_id}/confirm-received")
async def confirm_delivery_received(delivery_id: str, auth: dict = Depends(require_auth)):
    """Patient confirms medicines were received; marks delivery and prescription complete."""
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, prescription_id, patient_id::text, status
        FROM deliveries
        WHERE id = $1::uuid AND tenant_id = $2
        """,
        delivery_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Delivery not found")
    if str(row["patient_id"]) != str(patient_id):
        raise HTTPException(403, "Forbidden")

    rx_row = await pool.fetchrow(
        """
        SELECT status FROM prescriptions
        WHERE id = $1::uuid AND tenant_id = $2 AND patient_id = $3::uuid
        """,
        row["prescription_id"],
        auth["tenantId"],
        patient_id,
    )
    if not rx_row:
        raise HTTPException(404, "Prescription not found")
    if rx_row["status"] == "completed":
        return {
            "deliveryId": str(row["id"]),
            "prescriptionId": str(row["prescription_id"]),
            "deliveryStatus": "delivered",
            "prescriptionStatus": "completed",
            "alreadyConfirmed": True,
        }
    if rx_row["status"] not in ("routed", "fulfilled"):
        raise HTTPException(
            400,
            "Delivery can only be confirmed after your pharmacy order is placed",
        )

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE deliveries SET status = 'delivered' WHERE id = $1::uuid",
                delivery_id,
            )
            await conn.execute(
                """
                UPDATE prescriptions SET status = 'completed'
                WHERE id = $1::uuid AND tenant_id = $2
                """,
                row["prescription_id"],
                auth["tenantId"],
            )

    return {
        "deliveryId": str(row["id"]),
        "prescriptionId": str(row["prescription_id"]),
        "deliveryStatus": "delivered",
        "prescriptionStatus": "completed",
    }


@app.post("/api/v1/deliveries/{delivery_id}/advance")
async def advance_delivery(delivery_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT status FROM deliveries WHERE id = $1::uuid", delivery_id)
    if not row:
        raise HTTPException(404, "Not found")
    current = row["status"]
    try:
        nxt = ORDER[ORDER.index(current) + 1]
    except (ValueError, IndexError):
        nxt = "delivered"
    await pool.execute(
        "UPDATE deliveries SET status = $2 WHERE id = $1::uuid", delivery_id, nxt
    )
    return {"id": delivery_id, "status": nxt}
