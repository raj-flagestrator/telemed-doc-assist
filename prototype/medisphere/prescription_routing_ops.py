"""Shared DB operations: routing history, shortage reroute, notifications."""

from __future__ import annotations

import json
from typing import Any

import asyncpg

from medisphere.pharmacies import pharmacy_display
from medisphere.pharmacy_routing import select_pharmacy_for_patient, select_reroute_pharmacy
from medisphere.prescription_tracking import tracking_id_from_prescription_id
from medisphere.routing_history import append_routing_event, routing_history_from_row
from medisphere.tenant_pharmacy_config import pharmacy_reroute_settings


async def load_tenant_pharmacy_settings(pool: asyncpg.Pool, tenant_id: str) -> dict[str, Any]:
    row = await pool.fetchrow(
        "SELECT config FROM tenant_config WHERE tenant_id = $1",
        tenant_id,
    )
    if not row:
        return pharmacy_reroute_settings(None)
    cfg = row["config"]
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    return pharmacy_reroute_settings(cfg)


async def _resolve_practitioner_id(
    conn: asyncpg.Connection, tenant_id: str, prescription_id: str
) -> str | None:
    row = await conn.fetchrow(
        """
        SELECT a.practitioner_id::text
        FROM prescriptions p
        JOIN consultations c ON c.id = p.consultation_id AND c.tenant_id = p.tenant_id
        JOIN appointments a ON a.id = c.appointment_id AND a.tenant_id = p.tenant_id
        WHERE p.id = $1::uuid AND p.tenant_id = $2
        """,
        prescription_id,
        tenant_id,
    )
    return row["practitioner_id"] if row and row["practitioner_id"] else None


async def _insert_notification(
    conn: asyncpg.Connection,
    *,
    tenant_id: str,
    prescription_id: str,
    recipient_type: str,
    recipient_id: str,
    notification_type: str,
    payload: dict,
) -> None:
    await conn.execute(
        """
        INSERT INTO prescription_notifications (
          tenant_id, prescription_id, recipient_type, recipient_id, notification_type, payload
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb)
        """,
        tenant_id,
        prescription_id,
        recipient_type,
        recipient_id,
        notification_type,
        json.dumps(payload),
    )


async def record_initial_route(
    conn: asyncpg.Connection,
    *,
    tenant_id: str,
    prescription_id: str,
    routing: dict[str, str],
    actor: str = "system",
) -> list[dict]:
    row = await conn.fetchrow(
        "SELECT routing_history FROM prescriptions WHERE id = $1::uuid AND tenant_id = $2",
        prescription_id,
        tenant_id,
    )
    history = append_routing_event(
        routing_history_from_row(row) if row else [],
        event_type="initial_route",
        pharmacy_id=routing["pharmacyId"],
        pharmacy_name=routing["pharmacyName"],
        reason=routing["routingReason"],
        routing_mode=routing["routingMode"],
        actor=actor,
    )
    await conn.execute(
        "UPDATE prescriptions SET routing_history = $3::jsonb WHERE id = $1::uuid AND tenant_id = $2",
        prescription_id,
        tenant_id,
        json.dumps(history),
    )
    return history


async def handle_shortage_reroute(
    pool: asyncpg.Pool,
    *,
    tenant_id: str,
    prescription_id: str,
    from_pharmacy_id: str,
    shortage_medications: list[str],
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    settings = policy or await load_tenant_pharmacy_settings(pool, tenant_id)
    reroute_policy = settings["pharmacyReroutePolicy"]
    hub_enabled = settings["pharmacyHubEnabled"]
    centrally_managed = settings["pharmaciesCentrallyManaged"]

    async with pool.acquire() as conn:
        async with conn.transaction():
            rx = await conn.fetchrow(
                """
                SELECT p.id, p.patient_id, p.pharmacy_id, p.routing_history,
                       (SELECT pt.island FROM patients pt
                        WHERE pt.id = p.patient_id AND pt.tenant_id = p.tenant_id) AS island
                FROM prescriptions p
                WHERE p.id = $1::uuid AND p.tenant_id = $2
                FOR UPDATE OF p
                """,
                prescription_id,
                tenant_id,
            )
            if not rx:
                return {"ok": False, "error": "Prescription not found"}

            island = rx["island"]
            history = routing_history_from_row(rx)
            tracking_id = tracking_id_from_prescription_id(str(rx["id"]))
            from_name = pharmacy_display(from_pharmacy_id)

            target = select_reroute_pharmacy(
                island,
                exclude_pharmacy_ids=[from_pharmacy_id],
                policy=reroute_policy,
                hub_enabled=hub_enabled,
            )

            practitioner_id = await _resolve_practitioner_id(conn, tenant_id, prescription_id)
            patient_id = str(rx["patient_id"])

            if not target:
                history = append_routing_event(
                    history,
                    event_type="shortage_no_reroute",
                    pharmacy_id=from_pharmacy_id,
                    pharmacy_name=from_name,
                    reason="Stock shortage — no alternate pharmacy available under current policy",
                    routing_mode="blocked",
                    from_pharmacy_id=from_pharmacy_id,
                    shortage_medications=shortage_medications,
                    policy=reroute_policy,
                )
                await conn.execute(
                    """
                    UPDATE prescriptions
                    SET routing_history = $3::jsonb, status = 'shortage'
                    WHERE id = $1::uuid AND tenant_id = $2
                    """,
                    prescription_id,
                    tenant_id,
                    json.dumps(history),
                )
                shortage_payload = {
                    "trackingId": tracking_id,
                    "prescriptionId": prescription_id,
                    "fromPharmacyId": from_pharmacy_id,
                    "fromPharmacyName": from_name,
                    "shortageMedications": shortage_medications,
                    "requiresDoctorAction": True,
                    "autoRerouted": False,
                    "pharmaciesCentrallyManaged": centrally_managed,
                    "routingHistory": history,
                    "message": (
                        f"Stock shortage at {from_name} for {', '.join(shortage_medications)}. "
                        "No automatic reroute was available — your doctor will select another pharmacy."
                    ),
                }
                await _insert_notification(
                    conn,
                    tenant_id=tenant_id,
                    prescription_id=prescription_id,
                    recipient_type="patient",
                    recipient_id=patient_id,
                    notification_type="pharmacy_shortage",
                    payload=shortage_payload,
                )
                if practitioner_id:
                    await _insert_notification(
                        conn,
                        tenant_id=tenant_id,
                        prescription_id=prescription_id,
                        recipient_type="doctor",
                        recipient_id=practitioner_id,
                        notification_type="pharmacy_shortage",
                        payload={**shortage_payload, "action": "select_pharmacy"},
                    )
                return {
                    "ok": True,
                    "autoRerouted": False,
                    "requiresDoctorAction": True,
                    "status": "shortage",
                    "shortageMedications": shortage_medications,
                    "routingHistory": history,
                    "trackingId": tracking_id,
                }

            history = append_routing_event(
                history,
                event_type="shortage_reroute",
                pharmacy_id=target["pharmacyId"],
                pharmacy_name=target["pharmacyName"],
                reason=target["routingReason"],
                routing_mode=target["routingMode"],
                from_pharmacy_id=from_pharmacy_id,
                shortage_medications=shortage_medications,
                policy=reroute_policy,
            )
            await conn.execute(
                """
                UPDATE prescriptions
                SET pharmacy_id = $3, status = 'routed', routing_history = $4::jsonb
                WHERE id = $1::uuid AND tenant_id = $2
                """,
                prescription_id,
                tenant_id,
                target["pharmacyId"],
                json.dumps(history),
            )

            network_label = (
                "centrally managed pharmacy network (regional hub)"
                if centrally_managed
                else "decentralized pharmacy network (nearest site)"
            )
            shortage_msg = (
                f"Stock shortage at {from_name} for {', '.join(shortage_medications)}. "
                f"Your prescription was automatically rerouted to {target['pharmacyName']} "
                f"via the {network_label}."
            )
            doctor_msg = (
                f"Stock shortage at {from_name} ({', '.join(shortage_medications)}). "
                f"Automatically rerouted to {target['pharmacyName']} ({network_label})."
            )
            shortage_payload = {
                "trackingId": tracking_id,
                "prescriptionId": prescription_id,
                "fromPharmacyId": from_pharmacy_id,
                "fromPharmacyName": from_name,
                "toPharmacyId": target["pharmacyId"],
                "toPharmacyName": target["pharmacyName"],
                "shortageMedications": shortage_medications,
                "requiresDoctorAction": False,
                "autoRerouted": True,
                "pharmaciesCentrallyManaged": centrally_managed,
                "routingHistory": history,
                "routingReason": target["routingReason"],
                "message": shortage_msg,
            }
            await _insert_notification(
                conn,
                tenant_id=tenant_id,
                prescription_id=prescription_id,
                recipient_type="patient",
                recipient_id=patient_id,
                notification_type="pharmacy_shortage",
                payload=shortage_payload,
            )
            if practitioner_id:
                await _insert_notification(
                    conn,
                    tenant_id=tenant_id,
                    prescription_id=prescription_id,
                    recipient_type="doctor",
                    recipient_id=practitioner_id,
                    notification_type="pharmacy_shortage",
                    payload={**shortage_payload, "message": doctor_msg, "action": "view_routing"},
                )
            await _insert_notification(
                conn,
                tenant_id=tenant_id,
                prescription_id=prescription_id,
                recipient_type="patient",
                recipient_id=patient_id,
                notification_type="pharmacy_rerouted",
                payload={**shortage_payload, "message": shortage_msg},
            )
            if practitioner_id:
                await _insert_notification(
                    conn,
                    tenant_id=tenant_id,
                    prescription_id=prescription_id,
                    recipient_type="doctor",
                    recipient_id=practitioner_id,
                    notification_type="pharmacy_rerouted",
                    payload={**shortage_payload, "message": doctor_msg, "action": "view_or_override"},
                )
            pharmacy_msg = (
                f"Prescription {tracking_id} rerouted to your pharmacy from {from_name} "
                f"({', '.join(shortage_medications)} out of stock at originating site)."
            )
            await _insert_notification(
                conn,
                tenant_id=tenant_id,
                prescription_id=prescription_id,
                recipient_type="pharmacy",
                recipient_id=target["pharmacyId"],
                notification_type="pharmacy_order_rerouted",
                payload={
                    **shortage_payload,
                    "message": pharmacy_msg,
                    "action": "open_order",
                },
            )

            return {
                "ok": True,
                "autoRerouted": True,
                "requiresDoctorAction": False,
                "status": "routed",
                "prescriptionId": prescription_id,
                "trackingId": tracking_id,
                "fromPharmacyId": from_pharmacy_id,
                "fromPharmacyName": from_name,
                "pharmaciesCentrallyManaged": centrally_managed,
                **target,
                "shortageMedications": shortage_medications,
                "routingHistory": history,
            }


async def doctor_override_pharmacy(
    pool: asyncpg.Pool,
    *,
    tenant_id: str,
    prescription_id: str,
    pharmacy_id: str,
    practitioner_id: str,
) -> dict[str, Any]:
    from medisphere.pharmacies import PHARMACIES

    if pharmacy_id not in PHARMACIES:
        raise ValueError("Unknown pharmacy")

    async with pool.acquire() as conn:
        async with conn.transaction():
            rx = await conn.fetchrow(
                """
                SELECT p.id, p.patient_id, p.pharmacy_id, p.routing_history,
                       (SELECT pt.island FROM patients pt
                        WHERE pt.id = p.patient_id AND pt.tenant_id = p.tenant_id) AS island
                FROM prescriptions p
                WHERE p.id = $1::uuid AND p.tenant_id = $2
                FOR UPDATE OF p
                """,
                prescription_id,
                tenant_id,
            )
            if not rx:
                raise ValueError("Prescription not found")

            routing = select_pharmacy_for_patient(
                rx["island"],
                explicit_pharmacy_id=pharmacy_id,
            )
            prev = rx["pharmacy_id"]
            history = append_routing_event(
                routing_history_from_row(rx),
                event_type="doctor_override",
                pharmacy_id=routing["pharmacyId"],
                pharmacy_name=routing["pharmacyName"],
                reason=f"Doctor selected {routing['pharmacyName']}",
                routing_mode="explicit",
                from_pharmacy_id=prev,
                actor=f"doctor:{practitioner_id}",
            )
            await conn.execute(
                """
                UPDATE prescriptions
                SET pharmacy_id = $3, status = 'routed', routing_history = $4::jsonb
                WHERE id = $1::uuid AND tenant_id = $2
                """,
                prescription_id,
                tenant_id,
                pharmacy_id,
                json.dumps(history),
            )

            tracking_id = tracking_id_from_prescription_id(str(rx["id"]))
            patient_id = str(rx["patient_id"])
            payload = {
                "trackingId": tracking_id,
                "prescriptionId": prescription_id,
                "pharmacyId": pharmacy_id,
                "pharmacyName": routing["pharmacyName"],
                "routingHistory": history,
                "message": f"Your doctor routed the prescription to {routing['pharmacyName']}.",
            }
            await _insert_notification(
                conn,
                tenant_id=tenant_id,
                prescription_id=prescription_id,
                recipient_type="patient",
                recipient_id=patient_id,
                notification_type="pharmacy_doctor_override",
                payload=payload,
            )

            await conn.execute(
                """
                UPDATE prescription_notifications
                SET read_at = NOW()
                WHERE tenant_id = $1 AND prescription_id = $2::uuid
                  AND recipient_type = 'doctor' AND recipient_id = $3
                  AND read_at IS NULL
                  AND notification_type = 'pharmacy_shortage'
                """,
                tenant_id,
                prescription_id,
                practitioner_id,
            )

            return {
                "prescriptionId": prescription_id,
                "trackingId": tracking_id,
                "status": "routed",
                "routingHistory": history,
                **routing,
            }
