from __future__ import annotations

import os
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from medisphere.app_factory import create_app
from medisphere.auth import require_auth, require_roles
from medisphere.db import close_pool, get_pool, run_migrations

MIGRATION = """
CREATE TABLE IF NOT EXISTS consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  appointment_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  room_id TEXT NOT NULL,
  join_token TEXT NOT NULL,
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("consultation-service", MIGRATION)
    yield
    await close_pool()


app = create_app(name="consultation-service", lifespan=lifespan)


class ConsultationCreate(BaseModel):
    appointmentId: str


class ConsultationComplete(BaseModel):
    notes: str | None = None


@app.post("/api/v1/consultations")
async def create_consultation(body: ConsultationCreate, auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    room_id = f"room-{uuid4()}"
    join_token = str(uuid4())
    pool = await get_pool()
    existing = await pool.fetchrow(
        """
        SELECT id, room_id, join_token, status
        FROM consultations
        WHERE appointment_id = $1::uuid AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        """,
        body.appointmentId,
        auth["tenantId"],
    )
    if existing:
        return {
            "consultationId": str(existing["id"]),
            "roomId": existing["room_id"],
            "joinToken": existing["join_token"],
            "status": existing["status"],
            "signalingUrl": os.getenv("SIGNALING_URL", "wss://localhost/signaling"),
            "turnConfigured": True,
        }

    row = await pool.fetchrow(
        """
        INSERT INTO consultations (
          tenant_id, appointment_id, patient_id, status, room_id, join_token
        ) VALUES ($1, $2::uuid, $3::uuid, 'waiting', $4, $5) RETURNING id
        """,
        auth["tenantId"],
        body.appointmentId,
        patient_id,
        room_id,
        join_token,
    )
    return {
        "consultationId": str(row["id"]),
        "roomId": room_id,
        "joinToken": join_token,
        "status": "waiting",
        "signalingUrl": os.getenv("SIGNALING_URL", "wss://localhost/signaling"),
        "turnConfigured": True,
    }


@app.post("/api/v1/consultations/{consultation_id}/join")
async def join_consultation(consultation_id: str, _auth: dict = Depends(require_auth)):
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE consultations SET status = 'in_progress', started_at = NOW() WHERE id = $1::uuid
        """,
        consultation_id,
    )
    row = await pool.fetchrow(
        "SELECT room_id, join_token, status FROM consultations WHERE id = $1::uuid",
        consultation_id,
    )
    if not row:
        raise HTTPException(404, "Not found")
    return {
        "roomId": row["room_id"],
        "joinToken": row["join_token"],
        "status": row["status"],
        "mediaMode": "video",
        "audioOnlyFallback": True,
    }


@app.post("/api/v1/consultations/{consultation_id}/complete")
async def complete_consultation(
    consultation_id: str,
    body: ConsultationComplete | None = None,
    _auth: dict = Depends(require_auth),
):
    pool = await get_pool()
    notes = body.notes if body else None
    await pool.execute(
        """
        UPDATE consultations SET status = 'completed', completed_at = NOW(),
        notes = COALESCE($2, notes) WHERE id = $1::uuid
        """,
        consultation_id,
        notes,
    )
    return {"status": "completed"}


@app.get("/api/v1/consultations/patient/me")
async def list_patient_consultations(auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, appointment_id, patient_id, status, room_id, notes,
               started_at, completed_at, created_at
        FROM consultations
        WHERE tenant_id = $1 AND patient_id = $2::uuid
        ORDER BY created_at DESC
        """,
        auth["tenantId"],
        patient_id,
    )
    return {
        "consultations": [
            {
                "id": str(r["id"]),
                "appointmentId": str(r["appointment_id"]),
                "status": r["status"],
                "notes": r["notes"],
                "startedAt": r["started_at"].isoformat() if r["started_at"] else None,
                "completedAt": r["completed_at"].isoformat() if r["completed_at"] else None,
                "createdAt": r["created_at"].isoformat(),
            }
            for r in rows
        ]
    }


@app.get("/api/v1/consultations/by-appointment/{appointment_id}")
async def get_by_appointment(appointment_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT * FROM consultations
        WHERE appointment_id = $1::uuid AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        """,
        appointment_id,
        auth["tenantId"],
    )
    if not row:
        return {"consultation": None}
    return {
        "consultation": {
            "id": str(row["id"]),
            "appointmentId": str(row["appointment_id"]),
            "patientId": str(row["patient_id"]),
            "status": row["status"],
            "roomId": row["room_id"],
            "notes": row["notes"],
            "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
        }
    }


@app.post("/api/v1/consultations/doctor")
async def doctor_create_consultation(
    body: ConsultationCreate, auth: dict = Depends(require_roles("doctor"))
):
    practitioner_id = auth.get("practitionerId")
    if not practitioner_id:
        raise HTTPException(400, "Practitioner required")
    pool = await get_pool()
    appt = await pool.fetchrow(
        """
        SELECT id, patient_id, practitioner_id
        FROM appointments
        WHERE id = $1::uuid AND tenant_id = $2
        """,
        body.appointmentId,
        auth["tenantId"],
    )
    if not appt:
        raise HTTPException(404, "Appointment not found")
    if appt["practitioner_id"] != practitioner_id:
        raise HTTPException(403, "Not assigned to this appointment")

    existing = await pool.fetchrow(
        """
        SELECT id, room_id, join_token, status
        FROM consultations
        WHERE appointment_id = $1::uuid AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        """,
        body.appointmentId,
        auth["tenantId"],
    )
    if existing:
        return {
            "consultationId": str(existing["id"]),
            "roomId": existing["room_id"],
            "joinToken": existing["join_token"],
            "status": existing["status"],
            "signalingUrl": os.getenv("SIGNALING_URL", "wss://localhost/signaling"),
            "turnConfigured": True,
        }

    room_id = f"room-{uuid4()}"
    join_token = str(uuid4())
    row = await pool.fetchrow(
        """
        INSERT INTO consultations (
          tenant_id, appointment_id, patient_id, status, room_id, join_token
        ) VALUES ($1, $2::uuid, $3::uuid, 'waiting', $4, $5) RETURNING id
        """,
        auth["tenantId"],
        body.appointmentId,
        appt["patient_id"],
        room_id,
        join_token,
    )
    return {
        "consultationId": str(row["id"]),
        "roomId": room_id,
        "joinToken": join_token,
        "status": "waiting",
        "signalingUrl": os.getenv("SIGNALING_URL", "wss://localhost/signaling"),
        "turnConfigured": True,
    }


@app.get("/api/v1/consultations/{consultation_id}")
async def get_consultation(consultation_id: str, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM consultations WHERE id = $1::uuid AND tenant_id = $2",
        consultation_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Not found")
    return {
        "id": str(row["id"]),
        "appointmentId": str(row["appointment_id"]),
        "status": row["status"],
        "roomId": row["room_id"],
        "notes": row["notes"],
    }
