from __future__ import annotations

import asyncpg

_pool: asyncpg.Pool | None = None
_MIGRATION_LOCK_ID = 8675309


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        from medisphere.config import get_settings

        # Prototype runs many services in separate processes; keep pools small to avoid
        # Postgres "too many clients already" (default max_connections ≈ 100).
        _pool = await asyncpg.create_pool(
            get_settings().database_url,
            min_size=1,
            max_size=3,
            command_timeout=30,
        )
    return _pool


async def run_migrations(service_name: str, sql: str) -> None:
    """Apply service DDL once. Serialized with advisory lock to avoid concurrent CREATE races."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("SELECT pg_advisory_lock($1)", _MIGRATION_LOCK_ID)
        try:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    service TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            exists = await conn.fetchval(
                "SELECT 1 FROM schema_migrations WHERE service = $1", service_name
            )
            if exists:
                return
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO schema_migrations (service) VALUES ($1)", service_name
            )
        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", _MIGRATION_LOCK_ID)


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
