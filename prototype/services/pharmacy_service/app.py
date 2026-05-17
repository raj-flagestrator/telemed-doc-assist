from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

import asyncpg

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from medisphere.app_factory import create_app
from medisphere.auth import require_roles
from medisphere.db import close_pool, get_pool, run_migrations
from medisphere.pharmacies import PHARM_THAA, all_pharmacy_ids, pharmacy_display
from medisphere.prescription_tracking import (
    prescription_id_prefix_sql_param,
    tracking_id_from_prescription_id,
)
from medisphere.pharmacy_demo import (
    backfill_pharmacy_routing,
    ensure_demo_queue_item,
    medication_summary,
    ensure_catalog_stock,
    ensure_prescription_meds_stock,
    reset_demo_stock,
)

MIGRATION = """
CREATE TABLE IF NOT EXISTS pharmacy_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL DEFAULT '',
  quantity INT NOT NULL DEFAULT 0,
  low_threshold INT NOT NULL DEFAULT 50,
  UNIQUE (tenant_id, pharmacy_id, medication_name, dosage)
);

CREATE TABLE IF NOT EXISTS pharmacy_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  prescription_id UUID NOT NULL UNIQUE,
  patient_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  insurance_status TEXT NOT NULL DEFAULT 'pending',
  insurance_verified_at TIMESTAMPTZ,
  stock_reserved BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

async def _sync_delivery_for_prescription(
    pool, prescription_id: str, delivery_status: str
) -> None:
    await pool.execute(
        """
        UPDATE deliveries
        SET status = $2
        WHERE prescription_id = $1::uuid
          AND status NOT IN ('dispatched', 'in_transit', 'delivered')
        """,
        prescription_id,
        delivery_status,
    )


FULFILLMENT_ORDER = [
    "queued",
    "insurance_verified",
    "shortage",
    "preparing",
    "ready_for_dispatch",
    "dispatched",
    "rerouted",
]


def _meds_json(raw) -> list:
    if isinstance(raw, str):
        return json.loads(raw)
    return raw or []


async def _ensure_fulfillment(pool, tenant_id: str, pharmacy_id: str, rx: dict) -> dict:
    """Ensure a fulfillment row exists and matches the prescription's assigned pharmacy."""
    row = await pool.fetchrow(
        """
        SELECT id, pharmacy_id, status, insurance_status, stock_reserved, delivery_id,
               created_at, updated_at
        FROM pharmacy_fulfillments
        WHERE prescription_id = $1::uuid AND tenant_id = $2
        """,
        rx["id"],
        tenant_id,
    )
    if row:
        if row["pharmacy_id"] != pharmacy_id:
            row = await pool.fetchrow(
                """
                UPDATE pharmacy_fulfillments
                SET pharmacy_id = $3,
                    rerouted_to_pharmacy_id = NULL,
                    updated_at = NOW()
                WHERE id = $1::uuid AND tenant_id = $2
                RETURNING id, pharmacy_id, status, insurance_status, stock_reserved, delivery_id,
                          created_at, updated_at
                """,
                row["id"],
                tenant_id,
                pharmacy_id,
            )
        return dict(row)

    created = await pool.fetchrow(
        """
        INSERT INTO pharmacy_fulfillments (
          tenant_id, pharmacy_id, prescription_id, patient_id, status, insurance_status
        )
        VALUES ($1, $2, $3::uuid, $4::uuid, 'queued', 'pending')
        RETURNING id, status, insurance_status, stock_reserved, delivery_id, created_at, updated_at
        """,
        tenant_id,
        pharmacy_id,
        rx["id"],
        rx["patient_id"],
    )
    return dict(created)


MIGRATION_V2 = """
ALTER TABLE pharmacy_fulfillments ADD COLUMN IF NOT EXISTS shortage_medications JSONB;
ALTER TABLE pharmacy_fulfillments ADD COLUMN IF NOT EXISTS rerouted_to_pharmacy_id TEXT;
"""


async def _seed_pharmacy_demo(pool, tenant_id: str) -> None:
    """Wait for prescription/patient tables when services start in parallel."""
    for attempt in range(30):
        try:
            for pharmacy_id in all_pharmacy_ids():
                await reset_demo_stock(pool, tenant_id, pharmacy_id)
            await backfill_pharmacy_routing(pool, tenant_id, PHARM_THAA)
            await ensure_demo_queue_item(pool, tenant_id, PHARM_THAA)
            return
        except asyncpg.UndefinedTableError:
            if attempt >= 29:
                raise
            await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("pharmacy-service", MIGRATION)
    await run_migrations("pharmacy-service-v2", MIGRATION_V2)
    pool = await get_pool()
    from medisphere.config import get_settings

    settings = get_settings()
    tenant_id = settings.default_tenant_id
    await _seed_pharmacy_demo(pool, tenant_id)
    yield
    await close_pool()


app = create_app(name="pharmacy-service", lifespan=lifespan)


class StockAdjustBody(BaseModel):
    medicationName: str
    dosage: str = ""
    delta: int


def _fulfillment_payload(rx_row, f_row, patient_row) -> dict:
    meds = _meds_json(rx_row["medications"])
    rx_id = str(rx_row["id"])
    return {
        "fulfillmentId": str(f_row["id"]),
        "prescriptionId": rx_id,
        "trackingId": tracking_id_from_prescription_id(rx_id),
        "status": f_row["status"],
        "insuranceStatus": f_row["insurance_status"],
        "stockReserved": f_row["stock_reserved"],
        "deliveryId": str(f_row["delivery_id"]) if f_row["delivery_id"] else None,
        "signedAt": rx_row["signed_at"].isoformat(),
        "medications": meds,
        "patient": {
            "id": str(patient_row["id"]),
            "fullName": patient_row["full_name"],
            "phone": patient_row["phone"],
            "nationalId": patient_row["national_id"],
            "insuranceId": patient_row["insurance_id"],
            "island": patient_row["island"],
        },
        "createdAt": f_row["created_at"].isoformat(),
        "updatedAt": f_row["updated_at"].isoformat(),
    }


@app.get("/api/v1/pharmacy/stock")
async def list_stock(auth: dict = Depends(require_roles("pharmacy"))):
    pharmacy_id = auth.get("pharmacyId")
    if not pharmacy_id:
        raise HTTPException(400, "Pharmacy context required")
    pool = await get_pool()
    tenant_id = auth["tenantId"]
    await ensure_catalog_stock(pool, tenant_id, pharmacy_id)
    rows = await pool.fetch(
        """
        SELECT medication_name, dosage, quantity, low_threshold
        FROM pharmacy_stock
        WHERE tenant_id = $1 AND pharmacy_id = $2
        ORDER BY medication_name, dosage
        """,
        tenant_id,
        pharmacy_id,
    )
    items = []
    low_count = 0
    for r in rows:
        low = r["quantity"] <= r["low_threshold"]
        if low:
            low_count += 1
        items.append(
            {
                "medicationName": r["medication_name"],
                "dosage": r["dosage"],
                "quantity": r["quantity"],
                "lowThreshold": r["low_threshold"],
                "lowStock": low,
            }
        )
    return {
        "pharmacyId": pharmacy_id,
        "pharmacyName": pharmacy_display(pharmacy_id),
        "items": items,
        "lowStockCount": low_count,
    }


def _order_sort_key(item: dict) -> tuple:
    status = item["fulfillmentStatus"]
    try:
        status_idx = FULFILLMENT_ORDER.index(status)
    except ValueError:
        status_idx = len(FULFILLMENT_ORDER)
    return (status_idx, item["signedAt"])


async def _list_pharmacy_orders(pool, tenant_id: str, pharmacy_id: str) -> list[dict]:
    await backfill_pharmacy_routing(pool, tenant_id, pharmacy_id)
    rx_rows = await pool.fetch(
        """
        SELECT p.id, p.patient_id, p.medications, p.status, p.signed_at,
               pt.full_name, pt.island, pt.insurance_id
        FROM prescriptions p
        JOIN patients pt ON pt.id = p.patient_id AND pt.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
          AND p.pharmacy_id = $2
          AND p.status IN ('routed', 'fulfilled')
        ORDER BY p.signed_at DESC
        """,
        tenant_id,
        pharmacy_id,
    )

    orders: list[dict] = []
    delivery_ids: list = []
    for rx in rx_rows:
        f = await _ensure_fulfillment(
            pool,
            tenant_id,
            pharmacy_id,
            {"id": str(rx["id"]), "patient_id": str(rx["patient_id"])},
        )
        if f.get("delivery_id"):
            delivery_ids.append(f["delivery_id"])
        meds = _meds_json(rx["medications"])
        rx_id = str(rx["id"])
        orders.append(
            {
                "fulfillmentId": str(f["id"]),
                "prescriptionId": rx_id,
                "trackingId": tracking_id_from_prescription_id(rx_id),
                "patientName": rx["full_name"],
                "patientIsland": rx["island"],
                "insuranceId": rx["insurance_id"],
                "medicationCount": len(meds),
                "medicationsSummary": medication_summary(meds),
                "prescriptionStatus": rx["status"],
                "fulfillmentStatus": f["status"],
                "insuranceStatus": f["insurance_status"],
                "deliveryId": str(f["delivery_id"]) if f.get("delivery_id") else None,
                "deliveryStatus": None,
                "signedAt": rx["signed_at"].isoformat(),
                "_delivery_uuid": f.get("delivery_id"),
            }
        )

    if delivery_ids:
        d_rows = await pool.fetch(
            "SELECT id, status FROM deliveries WHERE id = ANY($1::uuid[])",
            delivery_ids,
        )
        delivery_by_id = {str(r["id"]): r["status"] for r in d_rows}
        for item in orders:
            did = item.pop("_delivery_uuid", None)
            if did:
                item["deliveryStatus"] = delivery_by_id.get(str(did))

    orders.sort(key=_order_sort_key)
    return orders


@app.get("/api/v1/pharmacy/queue")
async def prescription_queue(auth: dict = Depends(require_roles("pharmacy"))):
    pharmacy_id = auth.get("pharmacyId")
    if not pharmacy_id:
        raise HTTPException(400, "Pharmacy context required")
    pool = await get_pool()
    orders = await _list_pharmacy_orders(pool, auth["tenantId"], pharmacy_id)
    status_counts = {s: 0 for s in FULFILLMENT_ORDER}
    for item in orders:
        status = item["fulfillmentStatus"]
        status_counts[status] = status_counts.get(status, 0) + 1
    active_count = sum(1 for o in orders if o["fulfillmentStatus"] != "dispatched")
    return {
        "pharmacyId": pharmacy_id,
        "queue": orders,
        "orders": orders,
        "count": len(orders),
        "activeCount": active_count,
        "statusCounts": status_counts,
    }


@app.get("/api/v1/pharmacy/orders")
async def prescription_orders(auth: dict = Depends(require_roles("pharmacy"))):
    """All pharmacy orders (including dispatched) with status breakdown."""
    return await prescription_queue(auth)


async def _verify_prescription_by_tracking(tracking_id: str, auth: dict) -> dict:
    """Look up a prescription by RX-XXXXXXXX tracking ID (pharmacy counter verification)."""
    pharmacy_id = auth.get("pharmacyId")
    if not pharmacy_id:
        raise HTTPException(400, "Pharmacy context required")
    code = prescription_id_prefix_sql_param(tracking_id)
    if not code:
        raise HTTPException(400, "Invalid tracking ID — use format RX-XXXXXXXX")

    pool = await get_pool()
    tenant_id = auth["tenantId"]
    await backfill_pharmacy_routing(pool, tenant_id, pharmacy_id)

    row = await pool.fetchrow(
        """
        SELECT p.id, p.patient_id, p.medications, p.status, p.signed_at, p.pharmacy_id,
               pt.full_name, pt.island, pt.insurance_id
        FROM prescriptions p
        JOIN patients pt ON pt.id = p.patient_id AND pt.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
          AND upper(substring(replace(p.id::text, '-', '') from 1 for 8)) = $2
        ORDER BY p.signed_at DESC
        LIMIT 1
        """,
        tenant_id,
        code,
    )
    if not row:
        raise HTTPException(404, "No prescription found for this tracking ID")

    rx_pharmacy = (row["pharmacy_id"] or "").strip()
    if not rx_pharmacy:
        await pool.execute(
            """
            UPDATE prescriptions
            SET status = 'routed', pharmacy_id = $2
            WHERE id = $1::uuid AND tenant_id = $3
            """,
            row["id"],
            pharmacy_id,
            tenant_id,
        )
    elif rx_pharmacy != pharmacy_id:
        raise HTTPException(
            404,
            "No prescription found for this tracking ID at your pharmacy",
        )

    rx_id = str(row["id"])
    f = await _ensure_fulfillment(
        pool,
        auth["tenantId"],
        pharmacy_id,
        {"id": rx_id, "patient_id": str(row["patient_id"])},
    )
    meds = _meds_json(row["medications"])
    return {
        "trackingId": tracking_id_from_prescription_id(rx_id),
        "prescriptionId": rx_id,
        "fulfillmentId": str(f["id"]),
        "patientName": row["full_name"],
        "patientIsland": row["island"],
        "insuranceId": row["insurance_id"],
        "prescriptionStatus": row["status"],
        "fulfillmentStatus": f["status"],
        "medicationsSummary": medication_summary(meds),
        "verified": True,
    }


@app.get("/api/v1/pharmacy/verify")
async def verify_prescription_tracking_query(
    trackingId: str, auth: dict = Depends(require_roles("pharmacy"))
):
    return await _verify_prescription_by_tracking(trackingId, auth)


@app.get("/api/v1/pharmacy/verify/{tracking_id}")
async def verify_prescription_tracking(
    tracking_id: str, auth: dict = Depends(require_roles("pharmacy"))
):
    return await _verify_prescription_by_tracking(tracking_id, auth)


@app.get("/api/v1/pharmacy/fulfillments/{fulfillment_id}")
async def get_fulfillment(fulfillment_id: str, auth: dict = Depends(require_roles("pharmacy"))):
    pool = await get_pool()
    pharmacy_id = auth.get("pharmacyId")
    if not pharmacy_id:
        raise HTTPException(400, "Pharmacy context required")

    f_row = await pool.fetchrow(
        """
        SELECT * FROM pharmacy_fulfillments
        WHERE id = $1::uuid AND tenant_id = $2
        """,
        fulfillment_id,
        auth["tenantId"],
    )
    if not f_row:
        raise HTTPException(404, "Fulfillment not found")

    rx_row = await pool.fetchrow(
        "SELECT * FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
        f_row["prescription_id"],
        auth["tenantId"],
    )
    if not rx_row:
        raise HTTPException(404, "Prescription not found")

    assigned_pharmacy = (rx_row["pharmacy_id"] or "").strip()
    if assigned_pharmacy != pharmacy_id:
        raise HTTPException(404, "Fulfillment not found")

    if f_row["pharmacy_id"] != pharmacy_id:
        f_row = await pool.fetchrow(
            """
            UPDATE pharmacy_fulfillments
            SET pharmacy_id = $3,
                rerouted_to_pharmacy_id = NULL,
                updated_at = NOW()
            WHERE id = $1::uuid AND tenant_id = $2
            RETURNING *
            """,
            fulfillment_id,
            auth["tenantId"],
            pharmacy_id,
        )
        if not f_row:
            raise HTTPException(404, "Fulfillment not found")

    patient_row = await pool.fetchrow(
        "SELECT * FROM patients WHERE id = $1::uuid AND tenant_id = $2",
        f_row["patient_id"],
        auth["tenantId"],
    )
    if not patient_row:
        raise HTTPException(404, "Patient not found")

    delivery = None
    if f_row["delivery_id"]:
        d_row = await pool.fetchrow(
            "SELECT id, status, pharmacy_name, eta_minutes FROM deliveries WHERE id = $1::uuid",
            f_row["delivery_id"],
        )
        if d_row:
            delivery = {
                "id": str(d_row["id"]),
                "status": d_row["status"],
                "pharmacyName": d_row["pharmacy_name"],
                "etaMinutes": d_row["eta_minutes"],
            }

    stock_checks = []
    for med in _meds_json(rx_row["medications"]):
        s = await pool.fetchrow(
            """
            SELECT quantity, low_threshold FROM pharmacy_stock
            WHERE tenant_id = $1 AND pharmacy_id = $2
              AND medication_name = $3 AND dosage = $4
            """,
            auth["tenantId"],
            auth.get("pharmacyId"),
            med.get("name", ""),
            med.get("dosage", ""),
        )
        qty = s["quantity"] if s else 0
        stock_checks.append(
            {
                "name": med.get("name"),
                "dosage": med.get("dosage"),
                "available": qty > 0,
                "quantityOnHand": qty,
                "lowStock": bool(s and s["quantity"] <= s["low_threshold"]),
            }
        )

    payload = _fulfillment_payload(rx_row, f_row, patient_row)
    payload["stockChecks"] = stock_checks
    payload["delivery"] = delivery
    return payload


async def _advance_fulfillment(pool, fulfillment_id: str, tenant_id: str, next_status: str) -> None:
    await pool.execute(
        """
        UPDATE pharmacy_fulfillments
        SET status = $3, updated_at = NOW()
        WHERE id = $1::uuid AND tenant_id = $2
        """,
        fulfillment_id,
        tenant_id,
        next_status,
    )


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/verify-insurance")
async def verify_insurance(fulfillment_id: str, auth: dict = Depends(require_roles("pharmacy"))):
    pool = await get_pool()
    f_row = await pool.fetchrow(
        "SELECT * FROM pharmacy_fulfillments WHERE id = $1::uuid AND tenant_id = $2",
        fulfillment_id,
        auth["tenantId"],
    )
    if not f_row:
        raise HTTPException(404, "Not found")

    patient = await pool.fetchrow(
        "SELECT insurance_id FROM patients WHERE id = $1::uuid",
        f_row["patient_id"],
    )
    insurance_status = "verified" if patient and patient["insurance_id"] else "self_pay"

    await pool.execute(
        """
        UPDATE pharmacy_fulfillments
        SET status = 'insurance_verified',
            insurance_status = $3,
            insurance_verified_at = NOW(),
            updated_at = NOW()
        WHERE id = $1::uuid AND tenant_id = $2
        """,
        fulfillment_id,
        auth["tenantId"],
        insurance_status,
    )
    return {
        "fulfillmentId": fulfillment_id,
        "status": "insurance_verified",
        "insuranceStatus": insurance_status,
        "message": "Insurance verified" if insurance_status == "verified" else "No insurance on file — self-pay",
    }


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/reserve-stock")
async def reserve_stock(fulfillment_id: str, auth: dict = Depends(require_roles("pharmacy"))):
    import json as json_mod

    from medisphere.prescription_routing_ops import handle_shortage_reroute

    pool = await get_pool()
    pharmacy_id = auth.get("pharmacyId")
    tenant_id = auth["tenantId"]
    if not pharmacy_id:
        raise HTTPException(400, "Pharmacy context required")

    async with pool.acquire() as conn:
        f_row = await conn.fetchrow(
            "SELECT * FROM pharmacy_fulfillments WHERE id = $1::uuid AND tenant_id = $2",
            fulfillment_id,
            tenant_id,
        )
        if not f_row:
            raise HTTPException(404, "Not found")
        fulfillment_pharmacy_id = f_row["pharmacy_id"]
        if fulfillment_pharmacy_id != pharmacy_id:
            raise HTTPException(
                400,
                (
                    "This order is assigned to another pharmacy after a shortage reroute. "
                    "Open it from that pharmacy's queue."
                ),
            )
        if f_row["status"] == "shortage":
            await conn.execute(
                """
                UPDATE pharmacy_fulfillments
                SET status = 'insurance_verified',
                    shortage_medications = NULL,
                    updated_at = NOW()
                WHERE id = $1::uuid AND tenant_id = $2
                """,
                fulfillment_id,
                tenant_id,
            )
        elif f_row["status"] != "insurance_verified":
            raise HTTPException(400, "Verify insurance first")

        rx = await conn.fetchrow(
            "SELECT medications FROM prescriptions WHERE id = $1::uuid",
            f_row["prescription_id"],
        )
        if not rx:
            raise HTTPException(404, "Prescription not found")
        meds = _meds_json(rx["medications"])
        await ensure_prescription_meds_stock(pool, tenant_id, fulfillment_pharmacy_id, meds)
        shortages: list[str] = []
        decremented: list[tuple[str, str]] = []

        async with conn.transaction():
            for med in meds:
                name = med.get("name", "")
                dosage = med.get("dosage", "")
                updated = await conn.fetchrow(
                    """
                    UPDATE pharmacy_stock
                    SET quantity = quantity - 1
                    WHERE tenant_id = $1 AND pharmacy_id = $2
                      AND medication_name = $3 AND dosage = $4 AND quantity > 0
                    RETURNING quantity
                    """,
                    tenant_id,
                    fulfillment_pharmacy_id,
                    name,
                    dosage,
                )
                if updated:
                    decremented.append((name, dosage))
                else:
                    shortages.append(name)

            if not shortages:
                await conn.execute(
                    """
                    UPDATE pharmacy_fulfillments
                    SET status = 'preparing', stock_reserved = TRUE, updated_at = NOW()
                    WHERE id = $1::uuid
                    """,
                    fulfillment_id,
                )
                await _sync_delivery_for_prescription(
                    pool, str(f_row["prescription_id"]), "preparing"
                )
                return {
                    "fulfillmentId": fulfillment_id,
                    "status": "preparing",
                    "stockReserved": True,
                }

            for name, dosage in decremented:
                await conn.execute(
                    """
                    UPDATE pharmacy_stock
                    SET quantity = quantity + 1
                    WHERE tenant_id = $1 AND pharmacy_id = $2
                      AND medication_name = $3 AND dosage = $4
                    """,
                    tenant_id,
                    fulfillment_pharmacy_id,
                    name,
                    dosage,
                )

            await conn.execute(
                """
                UPDATE pharmacy_fulfillments
                SET status = 'shortage',
                    shortage_medications = $3::jsonb,
                    updated_at = NOW()
                WHERE id = $1::uuid
                """,
                fulfillment_id,
                tenant_id,
                json_mod.dumps(shortages),
            )

    prescription_id = str(f_row["prescription_id"])
    try:
        reroute_result = await handle_shortage_reroute(
            pool,
            tenant_id=tenant_id,
            prescription_id=prescription_id,
            from_pharmacy_id=fulfillment_pharmacy_id,
            shortage_medications=shortages,
        )
    except Exception as exc:
        raise HTTPException(500, f"Shortage reroute failed: {exc}") from exc

    if reroute_result.get("autoRerouted"):
        target_pharmacy_id = reroute_result["pharmacyId"]
        await ensure_catalog_stock(pool, tenant_id, target_pharmacy_id)
        await pool.execute(
            """
            UPDATE pharmacy_fulfillments
            SET pharmacy_id = $3,
                status = 'insurance_verified',
                shortage_medications = NULL,
                rerouted_to_pharmacy_id = NULL,
                stock_reserved = FALSE,
                updated_at = NOW()
            WHERE id = $1::uuid AND tenant_id = $2
            """,
            fulfillment_id,
            tenant_id,
            target_pharmacy_id,
        )
        return {
            "fulfillmentId": fulfillment_id,
            "status": "insurance_verified",
            "transferredToPharmacyId": target_pharmacy_id,
            "transferredToPharmacyName": reroute_result.get("pharmacyName"),
            "shortage": True,
            "shortageMedications": shortages,
            "message": reroute_result.get("routingReason"),
            **reroute_result,
        }

    if reroute_result.get("requiresDoctorAction"):
        raise HTTPException(
            409,
            (
                f"Insufficient stock: {', '.join(shortages)}. "
                "No automatic reroute available — doctor has been notified to select a pharmacy."
            ),
        )

    raise HTTPException(
        409,
        f"Insufficient stock: {', '.join(shortages)}.",
    )


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/mark-ready")
async def mark_ready(fulfillment_id: str, auth: dict = Depends(require_roles("pharmacy"))):
    pool = await get_pool()
    f_row = await pool.fetchrow(
        "SELECT status FROM pharmacy_fulfillments WHERE id = $1::uuid AND tenant_id = $2",
        fulfillment_id,
        auth["tenantId"],
    )
    if not f_row:
        raise HTTPException(404, "Not found")
    if f_row["status"] != "preparing":
        raise HTTPException(400, "Reserve stock and prepare medicines first")
    await _advance_fulfillment(pool, fulfillment_id, auth["tenantId"], "ready_for_dispatch")
    return {"fulfillmentId": fulfillment_id, "status": "ready_for_dispatch"}


class DispatchBody(BaseModel):
    deliveryId: str | None = None


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/dispatch")
async def mark_dispatched(
    fulfillment_id: str,
    body: DispatchBody | None = None,
    auth: dict = Depends(require_roles("pharmacy")),
):
    pool = await get_pool()
    f_row = await pool.fetchrow(
        "SELECT * FROM pharmacy_fulfillments WHERE id = $1::uuid AND tenant_id = $2",
        fulfillment_id,
        auth["tenantId"],
    )
    if not f_row:
        raise HTTPException(404, "Not found")
    if f_row["status"] != "ready_for_dispatch":
        raise HTTPException(400, "Mark order ready for dispatch first")

    delivery_id = body.deliveryId if body and body.deliveryId else f_row["delivery_id"]
    if not delivery_id:
        raise HTTPException(400, "Create delivery before dispatch")

    await pool.execute(
        "UPDATE deliveries SET status = 'dispatched' WHERE id = $1::uuid",
        delivery_id,
    )
    await pool.execute(
        """
        UPDATE pharmacy_fulfillments
        SET status = 'dispatched', delivery_id = $2::uuid, updated_at = NOW()
        WHERE id = $1::uuid
        """,
        fulfillment_id,
        delivery_id,
    )
    await pool.execute(
        "UPDATE prescriptions SET status = 'fulfilled' WHERE id = $1::uuid",
        f_row["prescription_id"],
    )
    return {
        "fulfillmentId": fulfillment_id,
        "status": "dispatched",
        "deliveryId": str(delivery_id),
        "prescriptionStatus": "fulfilled",
    }


class CreateDeliveryBody(BaseModel):
    prescriptionId: str
    patientId: str


@app.post("/api/v1/pharmacy/deliveries")
async def create_delivery_for_order(
    body: CreateDeliveryBody, auth: dict = Depends(require_roles("pharmacy"))
):
    pharmacy_id = auth.get("pharmacyId") or "pharm-male-central"
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO deliveries (tenant_id, prescription_id, patient_id, status, pharmacy_name, eta_minutes)
        VALUES ($1, $2::uuid, $3::uuid, 'pending', $4, 180) RETURNING id
        """,
        auth["tenantId"],
        body.prescriptionId,
        body.patientId,
        pharmacy_display(pharmacy_id),
    )
    delivery_id = str(row["id"])
    await pool.execute(
        """
        UPDATE pharmacy_fulfillments
        SET delivery_id = $2::uuid, updated_at = NOW()
        WHERE prescription_id = $1::uuid AND tenant_id = $3
        """,
        body.prescriptionId,
        delivery_id,
        auth["tenantId"],
    )
    return {
        "deliveryId": delivery_id,
        "status": "preparing",
        "pharmacyName": pharmacy_display(pharmacy_id),
        "etaMinutes": 180,
    }
