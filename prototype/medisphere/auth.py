from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from medisphere.config import get_settings

ALGORITHM = "HS256"
bearer_scheme = HTTPBearer(auto_error=False)


def sign_token(
    *,
    sub: str,
    tenant_id: str,
    roles: list[str],
    patient_id: str | None = None,
    practitioner_id: str | None = None,
    pharmacy_id: str | None = None,
    display_name: str | None = None,
) -> str:
    settings = get_settings()
    payload = {
        "sub": sub,
        "tenantId": tenant_id,
        "roles": roles,
        "patientId": patient_id,
        "practitionerId": practitioner_id,
        "pharmacyId": pharmacy_id,
        "displayName": display_name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


async def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return decode_token(credentials.credentials)


def require_roles(*allowed: str):
    async def checker(auth: Annotated[dict, Depends(require_auth)]) -> dict:
        roles = auth.get("roles") or []
        if not any(role in roles for role in allowed):
            raise HTTPException(status_code=403, detail="Forbidden")
        return auth

    return checker
