from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from medisphere.app_factory import create_app
from medisphere.auth import require_auth, require_roles
from medisphere.db import close_pool, get_pool, run_migrations

MIGRATION = """
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id UUID,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  national_id TEXT,
  insurance_id TEXT,
  island TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("patient-service", MIGRATION)
    yield
    await close_pool()


app = create_app(name="patient-service", lifespan=lifespan)


class PatientCreate(BaseModel):
    fullName: str = Field(min_length=2)
    phone: str = Field(min_length=7)
    nationalId: str | None = None
    insuranceId: str | None = None
    island: str | None = None


class PatientUpdate(BaseModel):
    fullName: str = Field(min_length=2)
    phone: str = Field(min_length=7)
    nationalId: str | None = None
    insuranceId: str | None = None
    island: str | None = None


@app.post("/api/v1/patients")
async def create_patient(body: PatientCreate, auth: dict = Depends(require_auth)):
    pool = await get_pool()
    patient_id = auth.get("patientId")
    if patient_id:
        row = await pool.fetchrow(
            """
            UPDATE patients
            SET full_name = $3, phone = $4, national_id = $5, insurance_id = $6, island = $7
            WHERE id = $1::uuid AND tenant_id = $2
            RETURNING id
            """,
            patient_id,
            auth["tenantId"],
            body.fullName,
            body.phone,
            body.nationalId or None,
            body.insuranceId or None,
            body.island or None,
        )
        if not row:
            raise HTTPException(404, "Patient not found")
        return {"patientId": str(row["id"])}

    row = await pool.fetchrow(
        """
        INSERT INTO patients (tenant_id, user_id, full_name, phone, national_id, insurance_id, island)
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
        RETURNING id
        """,
        auth["tenantId"],
        auth["sub"],
        body.fullName,
        body.phone,
        body.nationalId or None,
        body.insuranceId or None,
        body.island or None,
    )
    return {"patientId": str(row["id"])}


@app.patch("/api/v1/patients/me")
async def update_me(body: PatientUpdate, auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(404, "Patient profile not created")
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        UPDATE patients
        SET full_name = $3, phone = $4, national_id = $5, insurance_id = $6, island = $7
        WHERE id = $1::uuid AND tenant_id = $2
        RETURNING id, full_name, phone, national_id, insurance_id, island, created_at
        """,
        patient_id,
        auth["tenantId"],
        body.fullName,
        body.phone,
        body.nationalId or None,
        body.insuranceId or None,
        body.island or None,
    )
    if not row:
        raise HTTPException(404, "Not found")
    return {
        "id": str(row["id"]),
        "fullName": row["full_name"],
        "phone": row["phone"],
        "nationalId": row["national_id"],
        "insuranceId": row["insurance_id"],
        "island": row["island"],
        "createdAt": row["created_at"].isoformat(),
    }


@app.get("/api/v1/patients/me")
async def get_me(auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(404, "Patient profile not created")
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, full_name, phone, national_id, insurance_id, island, created_at
        FROM patients WHERE id = $1::uuid AND tenant_id = $2
        """,
        patient_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Not found")
    return {
        "id": str(row["id"]),
        "fullName": row["full_name"],
        "phone": row["phone"],
        "nationalId": row["national_id"],
        "insuranceId": row["insurance_id"],
        "island": row["island"],
        "createdAt": row["created_at"].isoformat(),
    }


@app.get("/api/v1/patients/{patient_id}")
async def get_patient(patient_id: str, auth: dict = Depends(require_roles("doctor", "pharmacy"))):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, full_name, phone, national_id, insurance_id, island, created_at
        FROM patients WHERE id = $1::uuid AND tenant_id = $2
        """,
        patient_id,
        auth["tenantId"],
    )
    if not row:
        raise HTTPException(404, "Not found")
    return {
        "id": str(row["id"]),
        "fullName": row["full_name"],
        "phone": row["phone"],
        "nationalId": row["national_id"],
        "insuranceId": row["insurance_id"],
        "island": row["island"],
        "createdAt": row["created_at"].isoformat(),
    }
