"""Prototype pharmacy staff OTP — practitioners registry + identity_otp table."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from medisphere.auth import sign_token
from medisphere.config import get_settings
from medisphere.db import get_pool
from medisphere.pharmacies import PHARMACIES, PHARMACY_ACCOUNTS, pharmacy_display

PROTOTYPE_OTP = "123456"


async def pharmacy_otp_request(email: str, tenant_id: str | None = None) -> dict:
    settings = get_settings()
    tenant_id = tenant_id or settings.default_tenant_id
    normalized = email.strip().lower()
    if normalized not in PHARMACY_ACCOUNTS:
        raise HTTPException(404, "Pharmacy account not found in prototype directory")

    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO identity_otp (tenant_id, phone, code, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, phone) DO UPDATE SET code = $3, expires_at = $4
        """,
        tenant_id,
        f"pharmacy:{normalized}",
        PROTOTYPE_OTP,
        expires,
    )
    return {"message": "OTP sent (prototype uses 123456)", "expiresInSeconds": 600}


async def pharmacy_otp_verify(email: str, code: str, tenant_id: str | None = None) -> dict:
    settings = get_settings()
    tenant_id = tenant_id or settings.default_tenant_id
    normalized = email.strip().lower()
    account = PHARMACY_ACCOUNTS.get(normalized)
    if not account:
        raise HTTPException(404, "Pharmacy account not found")

    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT code, expires_at FROM identity_otp WHERE tenant_id = $1 AND phone = $2",
        tenant_id,
        f"pharmacy:{normalized}",
    )
    if not row or row["code"] != code:
        raise HTTPException(401, "Invalid OTP")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(401, "OTP expired")

    pharmacy_id = account["pharmacyId"]
    token = sign_token(
        sub=f"pharmacy-{normalized}",
        tenant_id=tenant_id,
        roles=["pharmacy"],
        pharmacy_id=pharmacy_id,
        display_name=account["name"],
    )
    return {
        "accessToken": token,
        "pharmacyId": pharmacy_id,
        "pharmacyName": pharmacy_display(pharmacy_id),
        "displayName": account["name"],
        "staffRole": account["role"],
        "tenantId": tenant_id,
    }
