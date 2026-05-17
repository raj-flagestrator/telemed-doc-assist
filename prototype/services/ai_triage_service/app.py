from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from medisphere.app_factory import create_app
from medisphere.auth import require_auth, require_roles
from medisphere.db import close_pool, get_pool, run_migrations
from medisphere.triage_engine import assess_symptoms, chat_reply, greeting_message

MIGRATION = """
CREATE TABLE IF NOT EXISTS triage_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  patient_id UUID NOT NULL,
  symptoms JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("ai-triage-service", MIGRATION)
    yield
    await close_pool()


app = create_app(name="ai-triage-service", lifespan=lifespan)


class TriageRequest(BaseModel):
    symptoms: list[str]


class TriageChatRequest(BaseModel):
    symptoms: list[str] = []
    message: str | None = None


@app.get("/api/v1/triage/greeting")
async def triage_greeting():
    return {"message": greeting_message()}


@app.post("/api/v1/triage/chat")
async def triage_chat(body: TriageChatRequest, auth: dict = Depends(require_auth)):
    if not auth.get("patientId"):
        raise HTTPException(400, "Patient profile required")
    reply = chat_reply(body.symptoms, body.message)
    return {"reply": reply}


@app.get("/api/v1/triage/patient/{patient_id}/latest")
async def latest_for_patient(patient_id: str, auth: dict = Depends(require_roles("doctor"))):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, symptoms, result, created_at
        FROM triage_assessments
        WHERE tenant_id = $1 AND patient_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1
        """,
        auth["tenantId"],
        patient_id,
    )
    if not row:
        return {"assessment": None}
    symptoms = row["symptoms"]
    result = row["result"]
    if isinstance(symptoms, str):
        symptoms = json.loads(symptoms)
    if isinstance(result, str):
        result = json.loads(result)
    return {
        "assessment": {
            "id": str(row["id"]),
            "symptoms": symptoms,
            "result": result,
            "createdAt": row["created_at"].isoformat(),
        }
    }


@app.post("/api/v1/triage/assess")
async def assess(body: TriageRequest, auth: dict = Depends(require_auth)):
    patient_id = auth.get("patientId")
    if not patient_id:
        raise HTTPException(400, "Patient profile required")
    if not body.symptoms:
        raise HTTPException(400, "At least one symptom required")

    result = assess_symptoms(body.symptoms)
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO triage_assessments (tenant_id, patient_id, symptoms, result)
        VALUES ($1, $2::uuid, $3::jsonb, $4::jsonb) RETURNING id
        """,
        auth["tenantId"],
        patient_id,
        json.dumps(body.symptoms),
        json.dumps(result),
    )
    return {"assessmentId": str(row["id"]), **result}
