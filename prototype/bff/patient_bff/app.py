from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import httpx

from medisphere.app_factory import create_app
from medisphere.auth import decode_token, sign_token
from medisphere.config import get_settings
from medisphere.http_client import service_fetch
from medisphere.care_linking import (
    latest_consultation_by_appointment,
    latest_prescription_by_appointment,
    latest_prescription_by_consultation,
    prescription_for_appointment,
)
from medisphere.visit_status import (
    patient_care_bucket,
    prescription_is_patient_visible,
    visit_status,
)

app = create_app(name="patient-bff")
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


class OtpRequestBody(BaseModel):
    phone: str


class OtpVerifyBody(BaseModel):
    phone: str
    code: str = Field(min_length=6, max_length=6)


class ProfileBody(BaseModel):
    fullName: str
    phone: str
    nationalId: str | None = None
    insuranceId: str | None = None
    island: str | None = None


class TriageBody(BaseModel):
    symptoms: list[str]
    message: str | None = None


class RoutePrescriptionBody(BaseModel):
    pharmacyId: str | None = None
    patientIsland: str | None = None


@app.get("/api/v1/config")
async def get_config():
    return await service_fetch(
        settings.tenant_config_service_url,
        f"/api/v1/tenants/{settings.default_tenant_id}/config",
    )


@app.post("/api/v1/auth/otp/request")
async def otp_request(body: OtpRequestBody):
    return await service_fetch(
        settings.identity_service_url,
        "/api/v1/otp/request",
        method="POST",
        json={"phone": body.phone, "tenantId": settings.default_tenant_id},
    )


@app.post("/api/v1/auth/otp/verify")
async def otp_verify(body: OtpVerifyBody):
    return await service_fetch(
        settings.identity_service_url,
        "/api/v1/otp/verify",
        method="POST",
        json={"phone": body.phone, "code": body.code, "tenantId": settings.default_tenant_id},
    )


@app.post("/api/v1/patients/profile")
async def save_profile(body: ProfileBody, token: str = Depends(_token)):
    payload = decode_token(token)
    saved = await service_fetch(
        settings.patient_service_url,
        "/api/v1/patients",
        method="POST",
        json=body.model_dump(),
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    patient_id = saved["patientId"]
    if not payload.get("patientId"):
        await service_fetch(
            settings.identity_service_url,
            f"/api/v1/users/{payload['sub']}/patient",
            method="PATCH",
            json={"patientId": patient_id},
        )
        access_token = sign_token(
            sub=payload["sub"],
            tenant_id=settings.default_tenant_id,
            roles=["patient"],
            patient_id=patient_id,
        )
        return {"patientId": patient_id, "accessToken": access_token}
    return {"patientId": patient_id, "accessToken": token}


@app.get("/api/v1/patients/me")
async def patients_me(token: str = Depends(_token)):
    return await service_fetch(
        settings.patient_service_url,
        "/api/v1/patients/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def _fetch_optional(base_url: str, path: str, *, token: str) -> dict:
    try:
        return await service_fetch(
            base_url,
            path,
            token=token,
            tenant_id=settings.default_tenant_id,
        )
    except RuntimeError:
        return {}


@app.get("/api/v1/care/summary")
async def care_summary(token: str = Depends(_token)):
    auth = decode_token(token)
    if not auth.get("patientId"):
        return {
            "upcomingAppointments": [],
            "awaitingPrescription": [],
            "pastVisits": [],
            "needsProfile": True,
        }

    appt_data = await _fetch_optional(
        settings.appointment_service_url,
        "/api/v1/appointments/patient/me",
        token=token,
    )
    consult_data = await _fetch_optional(
        settings.consultation_service_url,
        "/api/v1/consultations/patient/me",
        token=token,
    )
    rx_data = await _fetch_optional(
        settings.prescription_service_url,
        "/api/v1/prescriptions/patient/me",
        token=token,
    )
    delivery_data = await _fetch_optional(
        settings.delivery_service_url,
        "/api/v1/deliveries/patient/me",
        token=token,
    )

    consult_by_appt = latest_consultation_by_appointment(consult_data.get("consultations", []))
    prescriptions = rx_data.get("prescriptions", [])
    rx_by_appt = latest_prescription_by_appointment(prescriptions)
    rx_by_consult = latest_prescription_by_consultation(prescriptions)
    delivery_by_rx = {d["prescriptionId"]: d for d in delivery_data.get("deliveries", [])}

    upcoming: list[dict] = []
    awaiting_rx: list[dict] = []
    past_visits: list[dict] = []

    for appt in appt_data.get("appointments", []):
        consult = consult_by_appt.get(appt["id"])
        rx = prescription_for_appointment(
            appt["id"],
            prescriptions,
            by_appointment=rx_by_appt,
            by_consultation=rx_by_consult,
            consultation_id=consult["id"] if consult else None,
        )
        if rx and not prescription_is_patient_visible(rx):
            rx = None
        if rx:
            rx = {
                **rx,
                "appointmentId": rx.get("appointmentId")
                or (consult.get("appointmentId") if consult else None)
                or appt["id"],
            }
        delivery = delivery_by_rx.get(rx["id"]) if rx else None
        vstatus = visit_status(appt, consult, rx)

        record = {
            "appointmentId": appt["id"],
            "startAt": appt["startAt"],
            "endAt": appt["endAt"],
            "practitionerName": appt["practitionerName"],
            "specialty": appt["specialty"],
            "appointmentStatus": appt["status"],
            "visitStatus": vstatus,
            "consultation": consult,
            "prescription": rx,
            "delivery": delivery,
        }

        bucket = patient_care_bucket(vstatus)
        if bucket == "past":
            past_visits.append(record)
        elif bucket == "awaiting_rx":
            awaiting_rx.append(record)
        else:
            upcoming.append(record)

    upcoming.sort(key=lambda x: x["startAt"])
    awaiting_rx.sort(key=lambda x: x["startAt"], reverse=True)
    past_visits.sort(key=lambda x: x["startAt"], reverse=True)

    return {
        "upcomingAppointments": upcoming,
        "awaitingPrescription": awaiting_rx,
        "pastVisits": past_visits,
        "needsProfile": False,
    }


async def _care_appointment_bundle(appointment_id: str, *, token: str, patient_id: str) -> dict:
    appt = await service_fetch(
        settings.appointment_service_url,
        f"/api/v1/appointments/{appointment_id}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )
    if str(appt.get("patientId")) != str(patient_id):
        raise HTTPException(404, "Appointment not found")

    consult_wrap = await _fetch_optional(
        settings.consultation_service_url,
        f"/api/v1/consultations/by-appointment/{appointment_id}",
        token=token,
    )
    consultation = consult_wrap.get("consultation")
    triage_wrap = await _fetch_optional(
        settings.ai_triage_service_url,
        f"/api/v1/triage/patient/{patient_id}/latest",
        token=token,
    )
    prescription = None
    delivery = None
    rx_wrap = await _fetch_optional(
        settings.prescription_service_url,
        f"/api/v1/prescriptions/by-appointment/{appointment_id}",
        token=token,
    )
    prescription = rx_wrap.get("prescription")
    if not prescription and consultation and consultation.get("id"):
        rx_wrap = await _fetch_optional(
            settings.prescription_service_url,
            f"/api/v1/prescriptions/by-consultation/{consultation['id']}",
            token=token,
        )
        prescription = rx_wrap.get("prescription")
    if not prescription:
        rx_list = await _fetch_optional(
            settings.prescription_service_url,
            "/api/v1/prescriptions/patient/me",
            token=token,
        )
        for rx in rx_list.get("prescriptions", []):
            if str(rx.get("appointmentId")) == str(appointment_id):
                prescription = rx
                break
    if prescription and not prescription_is_patient_visible(prescription):
        prescription = None
    if prescription:
        if prescription.get("pharmacyId") and not prescription.get("pharmacyName"):
            from medisphere.pharmacies import pharmacy_display

            prescription = {
                **prescription,
                "pharmacyName": pharmacy_display(prescription["pharmacyId"]),
            }
        prescription = {
            **prescription,
            "appointmentId": prescription.get("appointmentId")
            or (consultation.get("appointmentId") if consultation else None)
            or appointment_id,
        }
        del_wrap = await _fetch_optional(
            settings.delivery_service_url,
            f"/api/v1/deliveries/by-prescription/{prescription['id']}",
            token=token,
        )
        delivery = del_wrap.get("delivery")

    vstatus = visit_status(appt, consultation, prescription)
    return {
        "appointment": appt,
        "visitStatus": vstatus,
        "consultation": consultation,
        "triage": triage_wrap.get("assessment"),
        "prescription": prescription,
        "delivery": delivery,
    }


@app.get("/api/v1/care/appointments/{appointment_id}")
async def care_appointment_detail(appointment_id: str, token: str = Depends(_token)):
    auth = decode_token(token)
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(403, "Complete your profile first")
    return await _care_appointment_bundle(appointment_id, token=token, patient_id=patient_id)


@app.get("/api/v1/patient/appointments")
async def patient_appointments_list(token: str = Depends(_token)):
    return await service_fetch(
        settings.appointment_service_url,
        "/api/v1/appointments/patient/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/patient/consultations")
async def patient_consultations_list(token: str = Depends(_token)):
    return await service_fetch(
        settings.consultation_service_url,
        "/api/v1/consultations/patient/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/patient/prescriptions")
async def patient_prescriptions_list(token: str = Depends(_token)):
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/prescriptions/patient/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/patient/deliveries")
async def patient_deliveries_list(token: str = Depends(_token)):
    return await service_fetch(
        settings.delivery_service_url,
        "/api/v1/deliveries/patient/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/triage/greeting")
async def triage_greeting():
    return await service_fetch(settings.ai_triage_service_url, "/api/v1/triage/greeting")


@app.post("/api/v1/triage/chat")
async def triage_chat(body: TriageBody, token: str = Depends(_token)):
    if not body.message:
        raise HTTPException(400, "message required")
    return await service_fetch(
        settings.ai_triage_service_url,
        "/api/v1/triage/chat",
        method="POST",
        json={"symptoms": body.symptoms, "message": body.message},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/triage")
async def triage(body: TriageBody, token: str = Depends(_token)):
    return await service_fetch(
        settings.ai_triage_service_url,
        "/api/v1/triage/assess",
        method="POST",
        json={"symptoms": body.symptoms},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/appointments/slots")
async def appointment_slots(specialty: str = "Cardiology", token: str = Depends(_token)):
    return await service_fetch(
        settings.appointment_service_url,
        f"/api/v1/appointments/slots?specialty={specialty}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/appointments")
async def book_appointment(payload: dict, token: str = Depends(_token)):
    return await service_fetch(
        settings.appointment_service_url,
        "/api/v1/appointments",
        method="POST",
        json=payload,
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/consultations")
async def start_consultation(payload: dict, token: str = Depends(_token)):
    return await service_fetch(
        settings.consultation_service_url,
        "/api/v1/consultations",
        method="POST",
        json=payload,
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
    consultation_id: str, payload: dict | None = None, token: str = Depends(_token)
):
    return await service_fetch(
        settings.consultation_service_url,
        f"/api/v1/consultations/{consultation_id}/complete",
        method="POST",
        json=payload or {},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/prescriptions/by-tracking/{tracking_id}")
async def prescription_by_tracking(tracking_id: str, token: str = Depends(_token)):
    from urllib.parse import quote

    tid = quote(tracking_id.strip(), safe="")
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/prescriptions/by-tracking/{tid}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/prescriptions/by-consultation/{consultation_id}")
async def prescription_by_consultation(consultation_id: str, token: str = Depends(_token)):
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/prescriptions/by-consultation/{consultation_id}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/prescriptions")
async def create_prescription(_payload: dict, token: str = Depends(_token)):
    """Patients cannot self-issue prescriptions; only practitioners sign via doctor portal."""
    auth = decode_token(token)
    if "doctor" in (auth.get("roles") or []):
        raise HTTPException(
            400,
            "Use the doctor portal to sign prescriptions",
        )
    raise HTTPException(
        403,
        "Your doctor must digitally sign your prescription before it appears here",
    )


@app.get("/api/v1/notifications")
async def patient_notifications(token: str = Depends(_token)):
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/notifications/patient/me",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, token: str = Depends(_token)):
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
    return await service_fetch(
        settings.prescription_service_url,
        "/api/v1/pharmacies",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/prescriptions/{prescription_id}/pharmacy-recommendation")
async def pharmacy_recommendation(prescription_id: str, token: str = Depends(_token)):
    auth = decode_token(token)
    if not auth.get("patientId"):
        raise HTTPException(403, "Complete your profile first")
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/prescriptions/{prescription_id}/pharmacy-recommendation",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/prescriptions/{prescription_id}/route")
async def route_prescription(
    prescription_id: str,
    body: RoutePrescriptionBody | None = None,
    token: str = Depends(_token),
):
    auth = decode_token(token)
    if not auth.get("patientId"):
        raise HTTPException(403, "Complete your profile first")
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/prescriptions/{prescription_id}/route",
        method="POST",
        json=body.model_dump() if body else {},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/prescriptions/{prescription_id}/decline-pharmacy")
async def decline_pharmacy_order(prescription_id: str, token: str = Depends(_token)):
    auth = decode_token(token)
    if not auth.get("patientId"):
        raise HTTPException(403, "Complete your profile first")
    return await service_fetch(
        settings.prescription_service_url,
        f"/api/v1/prescriptions/{prescription_id}/decline-pharmacy",
        method="POST",
        json={},
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/deliveries")
async def create_delivery(payload: dict, token: str = Depends(_token)):
    return await service_fetch(
        settings.delivery_service_url,
        "/api/v1/deliveries",
        method="POST",
        json=payload,
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.get("/api/v1/deliveries/{delivery_id}")
async def get_delivery(delivery_id: str, token: str = Depends(_token)):
    return await service_fetch(
        settings.delivery_service_url,
        f"/api/v1/deliveries/{delivery_id}",
        token=token,
        tenant_id=settings.default_tenant_id,
    )


@app.post("/api/v1/deliveries/{delivery_id}/confirm-received")
async def confirm_delivery_received(delivery_id: str, token: str = Depends(_token)):
    auth = decode_token(token)
    if not auth.get("patientId"):
        raise HTTPException(403, "Complete your profile first")
    return await service_fetch(
        settings.delivery_service_url,
        f"/api/v1/deliveries/{delivery_id}/confirm-received",
        method="POST",
        json={},
        token=token,
        tenant_id=settings.default_tenant_id,
    )
