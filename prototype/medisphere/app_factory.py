from __future__ import annotations

from typing import AsyncIterator, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

REQUESTS = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)


def create_app(
    *,
    name: str,
    version: str = "0.1.0",
    lifespan: Callable[[FastAPI], AsyncIterator[None]] | None = None,
) -> FastAPI:
    app = FastAPI(title=name, version=version, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def metrics_middleware(request: Request, call_next):
        response = await call_next(request)
        REQUESTS.labels(request.method, request.url.path, str(response.status_code)).inc()
        return response

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": name, "version": version}

    @app.get("/ready")
    async def ready():
        return {"status": "ready", "service": name}

    @app.get("/version")
    async def version_info():
        return {"name": name, "version": version}

    @app.get("/metrics")
    async def metrics():
        return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app
