from __future__ import annotations

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from medisphere.app_factory import create_app
from medisphere.auth import decode_token
from medisphere.config import get_settings
from medisphere.http_client import service_fetch
from medisphere.doctor_auth import doctor_otp_request, doctor_otp_verify
from medisphere.practitioners import list_doctor_directory
from medisphere.pharmacies import pharmacy_display
from medisphere.visit_status import visit_status as _visit_status

app = create_app(name="doctor-bff")
settings = get_settings()


@app.exception_handler(RuntimeError)
async def upstream_service_error(_request, exc: RuntimeError):
    return JSONResponse(status_code=502, content={"error": str(exc)})


@app.exception_handler(httpx.ConnectError)
async def upstream_connect_error(_request, exc: httpx.ConnectError):
    return JSONResponse(
        status_code=503,
        content={
            "error": "A backend service is unavailable. Restart with: python scripts/run_all.py"
        },
    )


def _token(authorization: str | None = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    return authorization[7:]


def _doctor_auth(token: str = Depends(_token)) -> dict:
    return decode_token(token)


class DoctorOtpRequestBody(BaseModel):
    email: str


class DoctorOtpVerifyBody(BaseModel):
    email: str
    code: str = Field(min_length=6, max_length=6)


class CompleteConsultBody(BaseModel):
    notes: str | None = None


class MedicationLine(BaseModel):
    name: str
    dosage: str
    frequency: str
    duration: str


class PrescriptionBody(BaseModel):
    consultationId: str
    medications: list[MedicationLine] | None = None
    appointmentId: str | None = None


class PrescriptionRecommendBody(BaseModel):
    symptoms: list[str] = []
    riskLevel: str | None = None
    specialty: str | None = None
    consultationNotes: str | None = None


class StartConsultBody(BaseModel):
    appointmentId: str


@app.get("/api/v1/config")
async def get_config():
    return await service_fetch(
        settings.tenant_config_service_url,
        f"/api/v1/tenants/{settings.default_tenant_id}/config",
    )


@app.get("/api/v1/doctor/accounts")
async def doctor_accounts():
    """Served from shared practitioners registry (not identity-service) so the login dropdown stays current."""
    return {"doctors": list_doctor_directory()}


@app.post("/api/v1/auth/otp/request")
async def otp_request(body: DoctorOtpRequestBody):
    """Uses practitioners registry locally so ENT/Gastro logins work without restarting identity-service."""
    return await doctor_otp_request(body.email, settings.default_tenant_id)


@app.post("/api/v1/auth/otp/verify")
async def otp_verify(body: DoctorOtpVerifyBody):
    return await doctor_otp_verify(body.email, body.code, settings.default_tenant_id)


@app.get("/api/v1/me")
async def me(token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Doctor access only")
    return {
        "displayName": auth.get("displayName"),
        "practitionerId": auth.get("practitionerId"),
        "tenantId": auth.get("tenantId"),
    }


@app.get("/api/v1/schedule")
async def schedule(token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")

    data = await service_fetch(
        settings.appointment_service_url,
        "/api/v1/appointments/practitioner/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    enriched = []
    for appt in data.get("appointments", []):
        patient = await service_fetch(
            settings.patient_service_url,
            f"/api/v1/patients/{appt['patientId']}",
            token=token,
            tenant_id=settings.default_tenant_id,
        )
        consult_wrap = await service_fetch(
            settings.consultation_service_url,
            f"/api/v1/consultations/by-appointment/{appt['id']}",
            token=token,
            tenant_id=settings.default_tenant_id,
        )
        triage_wrap = await service_fetch(
            settings.ai_triage_service_url,
            f"/api/v1/triage/patient/{appt['patientId']}/latest",
            token=token,
            tenant_id=settings.default_tenant_id,
        )
        consultation = consult_wrap.get("consultation")
        rx_wrap: dict = {"prescription": None}
        if consultation and consultation.get("id"):
            try:
                rx_wrap = await service_fetch(
                    settings.prescription_service_url,
                    f"/api/v1/prescriptions/by-consultation/{consultation['id']}",
                    token=token,
                    tenant_id=settings.default_tenant_id,
                )
            except RuntimeError:
                rx_wrap = {"prescription": None}
        prescription = rx_wrap.get("prescription")
        if prescription and prescription.get("pharmacyId"):
            prescription = {
                **prescription,
                "pharmacyName": prescription.get("pharmacyName")
                or pharmacy_display(prescription["pharmacyId"]),
            }
        delivery = None
        if prescription and prescription.get("id"):
            try:
                del_wrap = await service_fetch(
                    settings.delivery_service_url,
                    f"/api/v1/deliveries/by-prescription/{prescription['id']}",
                    token=token,
                    tenant_id=settings.default_tenant_id,
                )
                delivery = del_wrap.get("delivery")
            except RuntimeError:
                delivery = None
        vstatus = _visit_status(appt, consultation, prescription)
        enriched.append(
            {
                **appt,
                "status": vstatus if vstatus == "completed" else appt.get("status"),
                "visitStatus": vstatus,
                "patient": patient,
                "consultation": consultation,
                "triage": triage_wrap.get("assessment"),
                "prescription": prescription,
                "delivery": delivery,
            }
        )
    return {"appointments": enriched}


@app.get("/api/v1/appointments/{appointment_id}")
async def appointment_detail(appointment_id: str, token: str = Depends(_token)):
    appt = await service_fetch(
        settings.appointment_service_url,
        f"/api/v1/appointments/{appointment_id}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    patient = await service_fetch(
        settings.patient_service_url,
        f"/api/v1/patients/{appt['patientId']}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    consult_wrap = await service_fetch(
        settings.consultation_service_url,
        f"/api/v1/consultations/by-appointment/{appointment_id}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    triage_wrap = await service_fetch(
        settings.ai_triage_service_url,
        f"/api/v1/triage/patient/{appt['patientId']}/latest",
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    consultation = consult_wrap.get("consultation")
    prescription = None
    delivery = None
    if consultation and consultation.get("id"):
        try:
            rx_wrap = await service_fetch(
                settings.prescription_service_url,
                f"/api/v1/prescriptions/by-consultation/{consultation['id']}",
                token=token,
                tenant_id=settings.default_tenant_id,
            )
            prescription = rx_wrap.get("prescription")
            if prescription and prescription.get("pharmacyId"):
                prescription["pharmacyName"] = prescription.get("pharmacyName") or pharmacy_display(
                    prescription["pharmacyId"]
                )
                try:
                    del_wrap = await service_fetch(
                        settings.delivery_service_url,
                        f"/api/v1/deliveries/by-prescription/{prescription['id']}",
                        token=token,
                        tenant_id=settings.default_tenant_id,
                    )
                    delivery = del_wrap.get("delivery")
                except RuntimeError:
                    delivery = None
        except RuntimeError:
            prescription = None
    return {
        "appointment": appt,
        "patient": patient,
        "consultation": consultation,
        "triage": triage_wrap.get("assessment"),
        "prescription": prescription,
        "delivery": delivery,
    }


@app.post("/api/v1/consultations/start")
async def start_consultation(body: StartConsultBody, token: str = Depends(_token)):
    return await service_fetch(
        settings.consultation_service_url,
        "/api/v1/consultations/doctor",
        method="POST",
        json=body.model_dump(),
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/consultations/{consultation_id}/join")
async def join_consultation(consultation_id: str, token: str = Depends(_token)):
    return await service_fetch(
        settings.consultation_service_url,
        f"/api/v1/consultations/{consultation_id}/join",
        method="POST",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/consultations/{consultation_id}/complete")
async def complete_consultation(
    consultation_id: str,
    body: CompleteConsultBody | None = None,
    token: str = Depends(_token),
):
    return await service_fetch(
        settings.consultation_service_url,
        f"/api/v1/consultations/{consultation_id}/complete",
        method="POST",
        json=body.model_dump() if body else {},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/prescriptions/recommend")
async def recommend_prescription(body: PrescriptionRecommendBody, token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/prescriptions/recommend",
        method="POST",
        json=body.model_dump(),
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/prescriptions")
async def issue_prescription(body: PrescriptionBody, token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    payload = {"consultationId": body.consultationId}
    if body.medications:
        payload["medications"] = [m.model_dump() for m in body.medications]
    result = await service_fetch(
        settings.prescription_service_url,
        "/api/v1/prescriptions",
        method="POST",
        json=payload,
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    if body.appointmentId:
        await service_fetch(
            settings.appointment_service_url,
            f"/api/v1/appointments/{body.appointmentId}/status",
            method="PATCH",
            json={"status": "completed"},
            token=token,
            tenant_id=settings.default_tenant_id,
        )
    return result


@app.get("/api/v1/notifications")
async def doctor_notifications(token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/notifications/doctor/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/notifications/{notification_id}/dismiss",
        method="POST",
        json={},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/notifications/dismiss-all")
async def dismiss_all_notifications(token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/notifications/dismiss-all",
        method="POST",
        json={},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/pharmacies")
async def list_pharmacies(token: str = Depends(_token)):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/pharmacies",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


class PharmacyOverrideBody(BaseModel):
    pharmacyId: str


@app.post("/api/v1/prescriptions/{prescription_id}/pharmacy-override")
async def pharmacy_override(
    prescription_id: str, body: PharmacyOverrideBody, token: str = Depends(_token)
):
    auth = decode_token(token)
    if "doctor" not in (auth.get("roles") or []):
        raise HTTPException(403, "Forbidden")
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/prescriptions/{prescription_id}/pharmacy-override",
        method="POST",
        json=body.model_dump(),
        token=token,
        tenant_id=settings.default_tenant_id,
    )
