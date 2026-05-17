from __future__ import annotations

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from medisphere.app_factory import create_app
from medisphere.auth import decode_token
from medisphere.config import get_settings
from medisphere.http_client import service_fetch
from medisphere.pharmacies import list_pharmacy_directory
from medisphere.pharmacy_auth import pharmacy_otp_request, pharmacy_otp_verify

app = create_app(name="pharmacy-bff")
settings = get_settings()


@app.exception_handler(RuntimeError)
async def upstream_service_error(_request, exc: RuntimeError):
    return JSONResponse(status_code=502, content={"error": str(exc)})


@app.exception_handler(httpx.ConnectError)
async def upstream_connect_error(_request, exc: httpx.ConnectError):
    return JSONResponse(
        status_code=503,
        content={
            "error": "Pharmacy backend unavailable — run: python scripts/run_all.py (from prototype folder)"
        },
    )


@app.exception_handler(Exception)
async def unhandled_error(_request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc) or "Internal server error"},
    )


def _token(authorization: str | None = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    return authorization[7:]


def _pharmacy_auth(token: str = Depends(_token)) -> dict:
    auth = decode_token(token)
    if "pharmacy" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    return auth


class PharmacyOtpRequestBody(BaseModel):
    email: str


class PharmacyOtpVerifyBody(BaseModel):
    email: str
    code: str


class CreateDeliveryBody(BaseModel):
    prescriptionId: str
    patientId: str


@app.get("/api/v1/config")
async def get_config():
    return await service_fetch(
        settings.tenant_config_service_url,
        f"/api/v1/tenants/{settings.default_tenant_id}/config",
    )


@app.get("/api/v1/pharmacy/accounts")
async def pharmacy_accounts():
    return {"accounts": list_pharmacy_directory()}


@app.post("/api/v1/auth/otp/request")
async def otp_request(body: PharmacyOtpRequestBody):
    return await pharmacy_otp_request(body.email, settings.default_tenant_id)


@app.post("/api/v1/auth/otp/verify")
async def otp_verify(body: PharmacyOtpVerifyBody):
    return await pharmacy_otp_verify(body.email, body.code, settings.default_tenant_id)


@app.get("/api/v1/me")
async def me(auth: dict = Depends(_pharmacy_auth)):
    return {
        "displayName": auth.get("displayName"),
        "pharmacyId": auth.get("pharmacyId"),
        "tenantId": auth["tenantId"],
    }


async def _svc(
    token: str, path: str, *, method: str = "GET", json: dict | None = None
) -> dict:
    return await service_fetch(
        settings.pharmacy_service_url,
        path,
        method=method,
        json=json,
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/notifications")
async def pharmacy_notifications(
    token: str = Depends(_token), _auth: dict = Depends(_pharmacy_auth)
):
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/notifications/pharmacy/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/notifications/{notification_id}/dismiss")
async def dismiss_notification(
    notification_id: str, token: str = Depends(_token), _auth: dict = Depends(_pharmacy_auth)
):
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/notifications/{notification_id}/dismiss",
        method="POST",
        json={},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/notifications/dismiss-all")
async def dismiss_all_notifications(
    token: str = Depends(_token), _auth: dict = Depends(_pharmacy_auth)
):
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/notifications/dismiss-all",
        method="POST",
        json={},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/pharmacy/queue")
async def queue(token: str = Depends(_token), _auth: dict = Depends(_pharmacy_auth)):
    return await _svc(token, "/api/v1/pharmacy/queue")


@app.get("/api/v1/pharmacy/orders")
async def orders(token: str = Depends(_token), _auth: dict = Depends(_pharmacy_auth)):
    return await _svc(token, "/api/v1/pharmacy/orders")


@app.get("/api/v1/pharmacy/verify")
async def verify_tracking_query(
    trackingId: str,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    from urllib.parse import quote

    return await _svc(
        token, f"/api/v1/pharmacy/verify?trackingId={quote(trackingId.strip(), safe='')}"
    )


@app.get("/api/v1/pharmacy/verify/{tracking_id}")
async def verify_tracking(
    tracking_id: str,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    return await _svc(token, f"/api/v1/pharmacy/verify/{tracking_id}")


@app.get("/api/v1/pharmacy/stock")
async def stock(token: str = Depends(_token), _auth: dict = Depends(_pharmacy_auth)):
    return await _svc(token, "/api/v1/pharmacy/stock")


@app.get("/api/v1/pharmacy/fulfillments/{fulfillment_id}")
async def fulfillment_detail(
    fulfillment_id: str,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    detail = await _svc(token, f"/api/v1/pharmacy/fulfillments/{fulfillment_id}")
    delivery = detail.get("delivery")
    if delivery and delivery.get("id"):
        try:
            tracking = await service_fetch(
                settings.delivery_service_url,
                f"/api/v1/deliveries/{delivery['id']}",
                token=token,
                tenant_id=settings.default_tenant_id,
            )
            detail["delivery"] = {**delivery, "trackingSteps": tracking.get("trackingSteps", [])}
        except RuntimeError:
            pass
    return detail


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/verify-insurance")
async def verify_insurance(
    fulfillment_id: str,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    return await _svc(
        token,
        f"/api/v1/pharmacy/fulfillments/{fulfillment_id}/verify-insurance",
        method="POST",
    )


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/reserve-stock")
async def reserve_stock(
    fulfillment_id: str,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    return await _svc(
        token,
        f"/api/v1/pharmacy/fulfillments/{fulfillment_id}/reserve-stock",
        method="POST",
    )


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/mark-ready")
async def mark_ready(
    fulfillment_id: str,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    return await _svc(
        token,
        f"/api/v1/pharmacy/fulfillments/{fulfillment_id}/mark-ready",
        method="POST",
    )


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/create-delivery")
async def create_delivery(
    fulfillment_id: str,
    body: CreateDeliveryBody,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    return await _svc(
        token,
        "/api/v1/pharmacy/deliveries",
        method="POST",
        json=body.model_dump(),
    )


@app.post("/api/v1/pharmacy/fulfillments/{fulfillment_id}/dispatch")
async def dispatch_order(
    fulfillment_id: str,
    token: str = Depends(_token),
    _auth: dict = Depends(_pharmacy_auth),
):
    detail = await _svc(token, f"/api/v1/pharmacy/fulfillments/{fulfillment_id}")
    delivery_id = (detail.get("delivery") or {}).get("id")
    if not delivery_id:
        raise HTTPException(400, "Create delivery coordination first")
    return await _svc(
        token,
        f"/api/v1/pharmacy/fulfillments/{fulfillment_id}/dispatch",
        method="POST",
        json={"deliveryId": delivery_id},
    )
