from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from medisphere.app_factory import create_app
from medisphere.auth import sign_token
from medisphere.config import get_settings
from medisphere.db import close_pool, get_pool, run_migrations
from medisphere.doctor_auth import doctor_otp_request, doctor_otp_verify
from medisphere.practitioners import list_doctor_directory

MIGRATION = """
CREATE TABLE IF NOT EXISTS identity_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  patient_id UUID,
  roles TEXT[] NOT NULL DEFAULT '{patient}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, phone)
);
CREATE TABLE IF NOT EXISTS identity_otp (
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, phone)
);
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("identity-service", MIGRATION)
    yield
    await close_pool()


app = create_app(name="identity-service", lifespan=lifespan)


class OtpRequest(BaseModel):
    phone: str = Field(min_length=7)
    tenantId: str | None = None


class OtpVerify(BaseModel):
    phone: str = Field(min_length=7)
    code: str = Field(min_length=6, max_length=6)
    tenantId: str | None = None


class LinkPatient(BaseModel):
    patientId: str


class DoctorOtpRequest(BaseModel):
    email: str = Field(min_length=5)
    tenantId: str | None = None


class DoctorOtpVerify(BaseModel):
    email: str = Field(min_length=5)
    code: str = Field(min_length=6, max_length=6)
    tenantId: str | None = None


@app.get("/api/v1/doctor/accounts")
async def list_doctor_accounts():
    """Prototype directory for doctor-portal login dropdown."""
    return {"doctors": list_doctor_directory()}


@app.post("/api/v1/otp/request")
async def request_otp(body: OtpRequest):
    settings = get_settings()
    tenant_id = body.tenantId or settings.default_tenant_id
    code = "123456"
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO identity_otp (tenant_id, phone, code, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, phone) DO UPDATE SET code = $3, expires_at = $4
        """,
        tenant_id,
        body.phone,
        code,
        expires,
    )
    return {"message": "OTP sent (prototype uses 123456)", "expiresInSeconds": 600}


@app.post("/api/v1/otp/verify")
async def verify_otp(body: OtpVerify):
    settings = get_settings()
    tenant_id = body.tenantId or settings.default_tenant_id
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT code, expires_at FROM identity_otp WHERE tenant_id = $1 AND phone = $2",
        tenant_id,
        body.phone,
    )
    if not row or row["code"] != body.code:
        raise HTTPException(401, "Invalid OTP")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(401, "OTP expired")

    user = await pool.fetchrow(
        "SELECT id, patient_id FROM identity_users WHERE tenant_id = $1 AND phone = $2",
        tenant_id,
        body.phone,
    )
    if not user:
        user = await pool.fetchrow(
            "INSERT INTO identity_users (tenant_id, phone) VALUES ($1, $2) RETURNING id, patient_id",
            tenant_id,
            body.phone,
        )

    token = sign_token(
        sub=str(user["id"]),
        tenant_id=tenant_id,
        roles=["patient"],
        patient_id=str(user["patient_id"]) if user["patient_id"] else None,
    )
    return {
        "accessToken": token,
        "userId": str(user["id"]),
        "patientId": str(user["patient_id"]) if user["patient_id"] else None,
        "tenantId": tenant_id,
    }


@app.patch("/api/v1/users/{user_id}/patient")
async def link_patient(user_id: str, body: LinkPatient):
    pool = await get_pool()
    await pool.execute(
        "UPDATE identity_users SET patient_id = $1::uuid WHERE id = $2::uuid",
        body.patientId,
        user_id,
    )

    return {"ok": True}


@app.post("/api/v1/doctor/otp/request")
async def doctor_otp_request_route(body: DoctorOtpRequest):
    settings = get_settings()
    return await doctor_otp_request(body.email, body.tenantId or settings.default_tenant_id)


@app.post("/api/v1/doctor/otp/verify")
async def doctor_otp_verify_route(body: DoctorOtpVerify):
    settings = get_settings()
    return await doctor_otp_verify(
        body.email, body.code, body.tenantId or settings.default_tenant_id
    )
