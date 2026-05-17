from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from medisphere.app_factory import create_app
from medisphere.auth import require_auth, require_roles
from medisphere.db import close_pool, get_pool, run_migrations
from medisphere.pharmacy_routing import select_pharmacy_for_patient
from medisphere.prescription_ai import recommend_medications
from medisphere.prescription_payload import prescription_from_row, prescription_public
from medisphere.prescription_tracking import (
    prescription_id_prefix_sql_param,
    tracking_id_from_prescription_id,
)
from medisphere.visit_status import PATIENT_HIDDEN_RX_STATUSES

MIGRATION = """
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
"""


MIGRATION_V2 = """
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS routing_history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS prescription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  prescription_id UUID NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rx_notifications_recipient
  ON prescription_notifications (tenant_id, recipient_type, recipient_id, created_at DESC);
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("prescription-service", MIGRATION)
    await run_migrations("prescription-service-v2", MIGRATION_V2)
    yield
    await close_pool()


app = create_app(name="prescription-service", lifespan=lifespan)


class MedicationLine(BaseModel):
    name: str
    dosage: str
    frequency: str
    duration: str


class PrescriptionCreate(BaseModel):
    consultationId: str
    medications: list[MedicationLine] | None = None


class PrescriptionRecommend(BaseModel):
    symptoms: list[str] = []
    riskLevel: str | None = None
    specialty: str | None = None
    consultationNotes: str | None = None


class RoutePrescription(BaseModel):
    pharmacyId: str | None = None
    patientIsland: str | None = None


class DoctorPharmacyOverride(BaseModel):
    pharmacyId: str


async def _resolve_patient_id(pool, consultation_id: str, tenant_id: str) -> str:
    row = await pool.fetchrow(
        "SELECT patient_id FROM consultations WHERE id = $1::uuid AND tenant_id = $2",
        consultation_id,
        tenant_id,
    )
    if not row:
        raise HTTPException(404, "Consultation not found")
    return str(row["patient_id"])


@app.post("/api/v1/prescriptions/recommend")
async def recommend_prescription(body: PrescriptionRecommend, _auth: dict = Depends(require_auth)):
    result = recommend_medications(
        symptoms=body.symptoms,
        risk_level=body.riskLevel,
        specialty=body.specialty,
        consultation_notes=body.consultationNotes,
    )
    return result


def _patient_may_view_prescription(auth: dict, status: str | None) -> bool:
    if "doctor" in (auth.get("roles") or []):
        return True
    return (status or "") not in PATIENT_HIDDEN_RX_STATUSES


async def _assert_patient_owns_prescription(
    pool, prescription_id: str, tenant_id: str, patient_id: str
) -> None:
    owner = await pool.fetchval(
        "SELECT patient_id::text FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
        prescription_id,
        tenant_id,
    )
    if not owner:
        raise HTTPException(404, "Prescription not found")
    if str(owner) != str(patient_id):
        raise HTTPException(403, "Forbidden")


@app.get("/api/v1/prescriptions/patient/me")
async def list_patient_prescriptions(auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT p.id, p.consultation_id, p.medications, p.status, p.pharmacy_id,
               p.routing_history, p.signed_at, p.created_at, c.appointment_id
        FROM prescriptions p
        LEFT JOIN consultations c ON c.id = p.consultation_id AND c.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.patient_id = $2::uuid
          AND NOT (p.status = ANY($3::text[]))
        ORDER BY p.signed_at DESC
        """,
        auth["tenantId"],
        patient_id,
        list(PATIENT_HIDDEN_RX_STATUSES),
    )
    items = []
    for r in rows:
        meds = r["medications"]
        if isinstance(meds, str):
            meds = json.loads(meds)
        items.append(prescription_from_row(r))
    return {"prescriptions": items}


@app.get("/api/v1/prescriptions/by-consultation/{consultation_id}")
async def get_by_consultation(consultation_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT p.id, p.medications, p.status, p.pharmacy_id, p.routing_history,
               p.signed_at, c.appointment_id
        FROM prescriptions p
        LEFT JOIN consultations c ON c.id = p.consultation_id AND c.tenant_id = p.tenant_id
        WHERE p.consultation_id = $1::uuid AND p.tenant_id = $2
        ORDER BY signed_at DESC LIMIT 1
        """,
        consultation_id,
        auth["tenantId"],
    )
    if not row:
        return {"prescription": None}
    if not _patient_may_view_prescription(auth, row["status"]):
        return {"prescription": None}
    meds = row["medications"]
    if isinstance(meds, str):
        meds = json.loads(meds)
    return {"prescription": prescription_from_row(row)}


@app.get("/api/v1/prescriptions/by-tracking/{tracking_id}")
async def get_by_tracking(tracking_id: str, auth: dict = Depends(require_auth)):
    prefix = prescription_id_prefix_sql_param(tracking_id)
    if not prefix:
        raise HTTPException(400, "Invalid tracking ID")
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT p.id, p.consultation_id, p.medications, p.status, p.pharmacy_id,
               p.routing_history, p.signed_at, p.created_at, c.appointment_id, p.patient_id
        FROM prescriptions p
        LEFT JOIN consultations c ON c.id = p.consultation_id AND c.tenant_id = p.tenant_id
        WHERE p.tenant_id = $2
          AND replace(p.id::text, '-', '') ILIKE $1
        ORDER BY p.signed_at DESC
        LIMIT 1
        """,
        f"{prefix}%",
        auth["tenantId"],
    )
    if not row:
        return {"prescription": None}
    patient_id = auth.get("patientId")
    if patient_id and str(row["patient_id"]) != str(patient_id):
        if "doctor" not in (auth.get("roles") or []):
            raise HTTPException(403, "Forbidden")
    if not _patient_may_view_prescription(auth, row["status"]):
        return {"prescription": None}
    meds = row["medications"]
    if isinstance(meds, str):
        meds = json.loads(meds)
    return {"prescription": prescription_from_row(row)}


@app.get("/api/v1/prescriptions/by-appointment/{appointment_id}")
async def get_by_appointment(appointment_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT p.id, p.consultation_id, p.medications, p.status, p.pharmacy_id,
               p.routing_history, p.signed_at, c.appointment_id
        FROM prescriptions p
        JOIN consultations c ON c.id = p.consultation_id AND c.tenant_id = p.tenant_id
        WHERE c.appointment_id = $1::uuid AND p.tenant_id = $2
          AND NOT (p.status = ANY($3::text[]))
        ORDER BY p.signed_at DESC
        LIMIT 1
        """,
        appointment_id,
        auth["tenantId"],
        list(PATIENT_HIDDEN_RX_STATUSES),
    )
    if not row:
        return {"prescription": None}
    if not _patient_may_view_prescription(auth, row["status"]):
        return {"prescription": None}
    meds = row["medications"]
    if isinstance(meds, str):
        meds = json.loads(meds)
    return {"prescription": prescription_from_row(row)}


@app.post("/api/v1/prescriptions")
async def create_prescription(body: PrescriptionCreate, auth: dict = Depends(require_auth)):
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(
            403,
            "Only a practitioner can sign and issue prescriptions",
        )
    if not body.medications:
        raise HTTPException(400, "Medications are required to sign a prescription")

    pool = await get_pool()
    patient_id = await _resolve_patient_id(pool, body.consultationId, auth["tenantId"])
    meds = [m.model_dump() for m in body.medications]
    tenant_id = auth["tenantId"]

    existing = await pool.fetchrow(
        """
        SELECT id FROM prescriptions
        WHERE consultation_id = $1::uuid AND tenant_id = $2
        ORDER BY signed_at DESC
        LIMIT 1
        """,
        body.consultationId,
        tenant_id,
    )

    if existing:
        row = await pool.fetchrow(
            """
            UPDATE prescriptions
            SET medications = $1::jsonb, status = 'signed', signed_at = NOW()
            WHERE id = $2::uuid AND tenant_id = $3
            RETURNING id
            """,
            json.dumps(meds),
            existing["id"],
            tenant_id,
        )
    else:
        row = await pool.fetchrow(
            """
            INSERT INTO prescriptions (tenant_id, consultation_id, patient_id, medications, status)
            VALUES ($1, $2::uuid, $3::uuid, $4::jsonb, 'signed')
            RETURNING id
            """,
            tenant_id,
            body.consultationId,
            patient_id,
            json.dumps(meds),
        )

    rx_id = str(row["id"])
    tracking_id = tracking_id_from_prescription_id(rx_id)
    async with pool.acquire() as conn:
        from medisphere.prescription_routing_ops import _insert_notification

        await _insert_notification(
            conn,
            tenant_id=tenant_id,
            prescription_id=rx_id,
            recipient_type="patient",
            recipient_id=patient_id,
            notification_type="prescription_signed",
            payload={
                "trackingId": tracking_id,
                "prescriptionId": rx_id,
                "message": (
                    "Your doctor signed your ePrescription. "
                    "Review it and choose a pharmacy to place your order, or finish without ordering."
                ),
            },
        )
    return {
        "prescriptionId": rx_id,
        "trackingId": tracking_id,
        "medications": meds,
        "status": "signed",
        "digitallySigned": True,
    }


@app.get("/api/v1/prescriptions/{prescription_id}/pharmacy-recommendation")
async def pharmacy_recommendation(prescription_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT p.patient_id, p.status, pt.island
        FROM prescriptions p
        LEFT JOIN patients pt ON pt.id = p.patient_id AND pt.tenant_id = p.tenant_id
        WHERE p.id = $1::uuid AND p.tenant_id = $2
        """,
        prescription_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Prescription not found")
    if not _patient_may_view_prescription(auth, row["status"]):
        raise HTTPException(404, "Prescription not found")
    patient_id = auth.get("patientId")
    if patient_id and str(row["patient_id"]) != str(patient_id):
        if "doctor" not in (auth.get("roles") or []):
            raise HTTPException(403, "Forbidden")

    from medisphere.pharmacy_routing import list_pharmacies_public, select_pharmacy_for_patient

    recommended = select_pharmacy_for_patient(row["island"])
    return {
        "prescriptionId": prescription_id,
        "recommended": recommended,
        "pharmacies": list_pharmacies_public(),
    }


@app.post("/api/v1/prescriptions/{prescription_id}/decline-pharmacy")
async def decline_pharmacy_order(prescription_id: str, auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    await _assert_patient_owns_prescription(pool, prescription_id, auth["tenantId"], patient_id)

    rx_status = await pool.fetchval(
        "SELECT status FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
        prescription_id,
        auth["tenantId"],
    )
    if rx_status == "pharmacy_declined":
        return {
            "prescriptionId": prescription_id,
            "trackingId": tracking_id_from_prescription_id(prescription_id),
            "status": "pharmacy_declined",
        }
    if rx_status != "signed":
        raise HTTPException(400, "Only a pending prescription can skip the pharmacy order")

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE prescriptions
                SET status = 'pharmacy_declined', pharmacy_id = NULL
                WHERE id = $1::uuid AND tenant_id = $2
                """,
                prescription_id,
                auth["tenantId"],
            )
    return {
        "prescriptionId": prescription_id,
        "trackingId": tracking_id_from_prescription_id(prescription_id),
        "status": "pharmacy_declined",
    }


@app.post("/api/v1/prescriptions/{prescription_id}/route")
async def route_prescription(
    prescription_id: str,
    body: RoutePrescription | None = None,
    auth: dict = Depends(require_auth),
):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT p.patient_id, pt.island
        FROM prescriptions p
        LEFT JOIN patients pt ON pt.id = p.patient_id AND pt.tenant_id = p.tenant_id
        WHERE p.id = $1::uuid AND p.tenant_id = $2
        """,
        prescription_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Prescription not found")

    rx_status = await pool.fetchval(
        "SELECT status FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
        prescription_id,
        auth["tenantId"],
    )
    roles = auth.get("roles") or []
    is_patient = "patient" in roles and "doctor" not in roles
    patient_id = auth.get("patientId")
    if is_patient:
        if not patient_id:
            raise HTTPException(400, "Patient profile required")
        if str(row["patient_id"]) != str(patient_id):
            raise HTTPException(403, "Forbidden")

    if rx_status == "routed":
        from medisphere.pharmacies import pharmacy_display

        existing_pharmacy = await pool.fetchval(
            "SELECT pharmacy_id FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
            prescription_id,
            auth["tenantId"],
        )
        return {
            "prescriptionId": prescription_id,
            "trackingId": tracking_id_from_prescription_id(prescription_id),
            "status": "routed",
            "pharmacyId": existing_pharmacy,
            "pharmacyName": pharmacy_display(existing_pharmacy) if existing_pharmacy else None,
            "alreadyRouted": True,
        }
    if rx_status != "signed":
        raise HTTPException(400, "Prescription must be signed before routing")

    patient_island = (body.patientIsland if body else None) or row["island"]
    explicit_pharmacy = body.pharmacyId if body else None
    if is_patient and not explicit_pharmacy:
        raise HTTPException(400, "Select a pharmacy to place your order")

    routing = select_pharmacy_for_patient(
        patient_island,
        explicit_pharmacy_id=explicit_pharmacy,
    )
    if is_patient:
        routing = {
            **routing,
            "routingReason": f"You chose {routing['pharmacyName']}",
            "routingMode": "patient_choice",
        }
    pharmacy_id = routing["pharmacyId"]

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE prescriptions SET status = 'routed', pharmacy_id = $2
                WHERE id = $1::uuid AND tenant_id = $3
                """,
                prescription_id,
                pharmacy_id,
                auth["tenantId"],
            )
            from medisphere.prescription_routing_ops import record_initial_route

            history = await record_initial_route(
                conn,
                tenant_id=auth["tenantId"],
                prescription_id=prescription_id,
                routing=routing,
                actor="patient" if is_patient else "doctor",
            )
    return {
        "prescriptionId": prescription_id,
        "trackingId": tracking_id_from_prescription_id(prescription_id),
        "status": "routed",
        "routingHistory": history,
        **routing,
    }


@app.get("/api/v1/notifications/patient/me")
async def patient_notifications(auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, prescription_id, notification_type, payload, read_at, created_at
        FROM prescription_notifications
        WHERE tenant_id = $1 AND recipient_type = 'patient' AND recipient_id = $2
        ORDER BY created_at DESC LIMIT 50
        """,
        auth["tenantId"],
        patient_id,
    )
    return {"notifications": [_notification_row(r) for r in rows]}


@app.get("/api/v1/notifications/pharmacy/me")
async def pharmacy_notifications(auth: dict = Depends(require_roles("pharmacy"))):
    pharmacy_id = auth.get("pharmacyId")
    if not pharmacy_id:
        raise HTTPException(400, "Pharmacy context required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, prescription_id, notification_type, payload, read_at, created_at
        FROM prescription_notifications
        WHERE tenant_id = $1 AND recipient_type = 'pharmacy' AND recipient_id = $2
        ORDER BY created_at DESC LIMIT 50
        """,
        auth["tenantId"],
        pharmacy_id,
    )
    return {"notifications": [_notification_row(r) for r in rows]}


@app.get("/api/v1/notifications/doctor/me")
async def doctor_notifications(auth: dict = Depends(require_roles("doctor"))):
    practitioner_id = auth.get("practitionerId")
    if not practitioner_id:
        raise HTTPException(400, "Practitioner context required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, prescription_id, notification_type, payload, read_at, created_at
        FROM prescription_notifications
        WHERE tenant_id = $1 AND recipient_type = 'doctor' AND recipient_id = $2
        ORDER BY created_at DESC LIMIT 50
        """,
        auth["tenantId"],
        str(practitioner_id),
    )
    return {"notifications": [_notification_row(r) for r in rows]}


def _notification_row(r) -> dict:
    payload = r["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return {
        "id": str(r["id"]),
        "prescriptionId": str(r["prescription_id"]),
        "type": r["notification_type"],
        "payload": payload,
        "read": r["read_at"] is not None,
        "createdAt": r["created_at"].isoformat(),
    }


def _notification_recipient(auth: dict) -> tuple[str, str]:
    roles = auth.get("roles") or []
    if "pharmacy" in roles:
        pharmacy_id = auth.get("pharmacyId")
        if pharmacy_id:
            return "pharmacy", str(pharmacy_id)
    if "doctor" in roles:
        practitioner_id = auth.get("practitionerId")
        if practitioner_id:
            return "doctor", str(practitioner_id)
    patient_id = auth.get("patientId")
    if patient_id:
        return "patient", str(patient_id)
    raise HTTPException(400, "No notification recipient context")


@app.post("/api/v1/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, auth: dict = Depends(require_auth)):
    recipient_type, recipient_id = _notification_recipient(auth)
    try:
        nid = uuid.UUID(notification_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid notification id") from exc
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        UPDATE prescription_notifications
        SET read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND tenant_id = $2 AND recipient_type = $3 AND recipient_id = $4
        RETURNING id
        """,
        nid,
        auth["tenantId"],
        recipient_type,
        recipient_id,
    )
    if not row:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}


@app.post("/api/v1/notifications/dismiss-all")
async def dismiss_all_notifications(auth: dict = Depends(require_auth)):
    recipient_type, recipient_id = _notification_recipient(auth)
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE prescription_notifications
        SET read_at = NOW()
        WHERE tenant_id = $1 AND recipient_type = $2 AND recipient_id = $3 AND read_at IS NULL
        """,
        auth["tenantId"],
        recipient_type,
        recipient_id,
    )
    return {"ok": True}


@app.post("/api/v1/prescriptions/{prescription_id}/pharmacy-override")
async def doctor_pharmacy_override(
    prescription_id: str,
    body: DoctorPharmacyOverride,
    auth: dict = Depends(require_roles("doctor")),
):
    practitioner_id = auth.get("practitionerId")
    if not practitioner_id:
        raise HTTPException(400, "Practitioner context required")
    pool = await get_pool()
    from medisphere.prescription_routing_ops import doctor_override_pharmacy

    try:
        result = await doctor_override_pharmacy(
            pool,
            tenant_id=auth["tenantId"],
            prescription_id=prescription_id,
            pharmacy_id=body.pharmacyId,
            practitioner_id=str(practitioner_id),
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return result


@app.get("/api/v1/prescriptions/{prescription_id}/routing-history")
async def get_routing_history(prescription_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT routing_history FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
        prescription_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Not found")
    from medisphere.routing_history import routing_history_from_row

    return {"prescriptionId": prescription_id, "routingHistory": routing_history_from_row(row)}


@app.get("/api/v1/pharmacies")
async def list_pharmacies(_auth: dict = Depends(require_auth)):
    from medisphere.pharmacy_routing import list_pharmacies_public

    return {"pharmacies": list_pharmacies_public()}


@app.get("/api/v1/prescriptions/{prescription_id}")
async def get_prescription(prescription_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
        prescription_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Not found")
    meds = row["medications"]
    if isinstance(meds, str):
        meds = json.loads(meds)
    return prescription_from_row(row)
