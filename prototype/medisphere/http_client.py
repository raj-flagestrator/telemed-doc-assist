from __future__ import annotations

import httpx


async def service_fetch(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    json: dict | None = None,
    token: str | None = None,
    tenant_id: str | None = None,
) -> dict:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if tenant_id:
        headers["x-tenant-id"] = tenant_id

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(method, f"{base_url}{path}", json=json, headers=headers)
        if response.status_code >= 400:
            detail = response.text.strip() or response.reason_phrase
            try:
                payload = response.json()
                if isinstance(payload, dict):
                    detail = payload.get("error") or payload.get("detail") or detail
                    if isinstance(detail, list):
                        detail = detail[0].get("msg", str(detail)) if detail else response.text
            except Exception:
                pass
            raise RuntimeError(f"Service {path} failed ({response.status_code}): {detail}")
        return response.json()
