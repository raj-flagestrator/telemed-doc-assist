from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel

from medisphere.app_factory import create_app
from medisphere.auth import require_auth, require_roles
from medisphere.db import close_pool, get_pool, run_migrations
from medisphere.practitioners import practitioners_for_specialty

MIGRATION = """
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  patient_id UUID NOT NULL,
  slot_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  practitioner_name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  language TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def build_slots(specialty: str) -> list[dict]:
    base = datetime.now(timezone.utc) + timedelta(hours=2)
    practitioners = practitioners_for_specialty(specialty)
    slots = []
    for idx, p in enumerate(practitioners):
        start = base + timedelta(hours=idx)
        end = start + timedelta(minutes=30)
        slots.append(
            {
                "id": f"slot-{p['id']}-{idx}",
                "practitionerId": p["id"],
                "practitionerName": p["name"],
                "specialty": p["specialty"],
                "startAt": start.isoformat(),
                "endAt": end.isoformat(),
                "language": "en",
            }
        )
    return slots


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("appointment-service", MIGRATION)
    yield
    await close_pool()


app = create_app(name="appointment-service", lifespan=lifespan)


class AppointmentCreate(BaseModel):
    slotId: str
    practitionerId: str
    practitionerName: str
    specialty: str
    language: str = "en"
    startAt: str
    endAt: str


@app.get("/api/v1/appointments/slots")
async def list_slots(
    specialty: str = Query("Cardiology"),
    _auth: dict = Depends(require_auth),
):
    return {"slots": build_slots(specialty)}


@app.post("/api/v1/appointments")
async def create_appointment(body: AppointmentCreate, auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO appointments (
          tenant_id, patient_id, slot_id, practitioner_id, practitioner_name,
          specialty, language, start_at, end_at
        ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        """,
        auth["tenantId"],
        patient_id,
        body.slotId,
        body.practitionerId,
        body.practitionerName,
        body.specialty,
        body.language,
        parse_iso_datetime(body.startAt),
        parse_iso_datetime(body.endAt),
    )
    return {"appointmentId": str(row["id"]), "status": "booked"}


def _appointment_row(r) -> dict:
    return {
        "id": str(r["id"]),
        "patientId": str(r["patient_id"]),
        "slotId": r["slot_id"],
        "practitionerId": r["practitioner_id"],
        "practitionerName": r["practitioner_name"],
        "specialty": r["specialty"],
        "language": r["language"],
        "startAt": r["start_at"].isoformat(),
        "endAt": r["end_at"].isoformat(),
        "status": r["status"],
    }


@app.get("/api/v1/appointments/patient/me")
async def list_patient_appointments(auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, patient_id, slot_id, practitioner_id, practitioner_name, specialty,
               language, start_at, end_at, status, created_at
        FROM appointments
        WHERE tenant_id = $1 AND patient_id = $2::uuid
        ORDER BY start_at DESC
        """,
        auth["tenantId"],
        patient_id,
    )
    return {"appointments": [_appointment_row(r) for r in rows]}


@app.get("/api/v1/appointments/practitioner/me")
async def list_practitioner_appointments(auth: dict = Depends(require_roles("doctor"))):
    practitioner_id = auth.get("practitionerId")
    if not practitioner_id:
        raise HTTPException(400, "Practitioner profile required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, patient_id, slot_id, practitioner_id, practitioner_name, specialty,
               language, start_at, end_at, status, created_at
        FROM appointments
        WHERE tenant_id = $1 AND practitioner_id = $2
        ORDER BY start_at ASC
        """,
        auth["tenantId"],
        practitioner_id,
    )
    return {"appointments": [_appointment_row(r) for r in rows]}


class AppointmentStatusUpdate(BaseModel):
    status: str


@app.patch("/api/v1/appointments/{appointment_id}/status")
async def update_appointment_status(
    appointment_id: str,
    body: AppointmentStatusUpdate,
    auth: dict = Depends(require_roles("doctor")),
):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        UPDATE appointments SET status = $3
        WHERE id = $1::uuid AND tenant_id = $2 AND practitioner_id = $4
        RETURNING id, status
        """,
        appointment_id,
        auth["tenantId"],
        body.status,
        auth.get("practitionerId"),
    )
    if not row:
        raise HTTPException(404, "Appointment not found")
    return {"appointmentId": str(row["id"]), "status": row["status"]}


@app.get("/api/v1/appointments/{appointment_id}")
async def get_appointment(appointment_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM appointments WHERE id = $1::uuid AND tenant_id = $2",
        appointment_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Not found")
    return {
        "id": str(row["id"]),
        "patientId": str(row["patient_id"]),
        "practitionerName": row["practitioner_name"],
        "specialty": row["specialty"],
        "language": row["language"],
        "startAt": row["start_at"].isoformat(),
        "endAt": row["end_at"].isoformat(),
        "status": row["status"],
    }
