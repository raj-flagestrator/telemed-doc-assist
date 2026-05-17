from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from medisphere.app_factory import create_app
from medisphere.db import close_pool, get_pool, run_migrations

DEFAULT_THEME = {
    "tenantId": "demo-maldives",
    "name": "MediSphere AI",
    "tagline": "AI POWERED. HUMAN CENTERED.",
    "logoUrl": "/brand/logo.svg",
    "primaryColor": "#0d9488",
    "secondaryColor": "#0f766e",
    "supportedLanguages": ["en", "dv"],
    "enabledModules": [
        "triage",
        "appointments",
        "consultation",
        "prescription",
        "delivery",
        "rpm",
    ],
    "pharmaciesCentrallyManaged": True,
    "pharmacyReroutePolicy": "hub_first",
    "pharmacyHubEnabled": True,
}

MIGRATION = """
CREATE TABLE IF NOT EXISTS tenant_config (
  tenant_id TEXT PRIMARY KEY,
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


MIGRATION_V2 = """
UPDATE tenant_config
SET config = config || '{"pharmacyReroutePolicy":"hub_first","pharmacyHubEnabled":true}'::jsonb,
    updated_at = NOW()
WHERE tenant_id = 'demo-maldives';
"""

MIGRATION_V3 = """
UPDATE tenant_config
SET config = config || '{"pharmaciesCentrallyManaged":true}'::jsonb,
    updated_at = NOW()
WHERE tenant_id = 'demo-maldives'
  AND NOT (config ? 'pharmaciesCentrallyManaged');
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_migrations("tenant-config-service", MIGRATION)
    await run_migrations("tenant-config-service-v2", MIGRATION_V2)
    await run_migrations("tenant-config-service-v3", MIGRATION_V3)
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO tenant_config (tenant_id, config) VALUES ($1, $2::jsonb)
        ON CONFLICT (tenant_id) DO NOTHING
        """,
        DEFAULT_THEME["tenantId"],
        json.dumps(DEFAULT_THEME),
    )
    yield
    await close_pool()


app = create_app(name="tenant-config-service", lifespan=lifespan)


@app.get("/api/v1/tenants/{tenant_id}/config")
async def get_config(tenant_id: str):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT config FROM tenant_config WHERE tenant_id = $1", tenant_id
    )
    if not row:
        raise HTTPException(404, "Tenant not found")
    return json.loads(row["config"]) if isinstance(row["config"], str) else row["config"]
