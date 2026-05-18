"""Clinical Copilot — Anthropic Messages proxy with SSE streaming.

Single concern: own the Anthropic API key + SDK. Callers (doctor-bff) compose the
system prompt and message history with patient context and hand it off here.

The browser never reaches this service directly; it is only callable from inside
the docker network via the BFF.
"""
from __future__ import annotations

import json
import os
from typing import AsyncIterator, Literal

from anthropic import AsyncAnthropic
from anthropic._exceptions import APIError, AuthenticationError
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from medisphere.app_factory import create_app

app = create_app(name="clinical-copilot-service")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5").strip()
ANTHROPIC_MAX_TOKENS = int(os.getenv("ANTHROPIC_MAX_TOKENS", "2048"))

_client: AsyncAnthropic | None = (
    AsyncAnthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    system: str = Field(default="", description="Composed clinical system prompt")
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None
    maxTokens: int | None = None


@app.get("/api/v1/copilot/info")
async def info() -> dict:
    return {
        "configured": _client is not None,
        "model": ANTHROPIC_MODEL,
        "maxTokens": ANTHROPIC_MAX_TOKENS,
    }


async def _stream_anthropic(req: ChatRequest) -> AsyncIterator[bytes]:
    """Yield SSE frames: `data: {"type": "...", ...}\\n\\n`."""
    assert _client is not None
    model = req.model or ANTHROPIC_MODEL
    max_tokens = req.maxTokens or ANTHROPIC_MAX_TOKENS
    payload = [m.model_dump() for m in req.messages]

    try:
        async with _client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=req.system or None,
            messages=payload,
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield _sse({"type": "delta", "text": text})
            final = await stream.get_final_message()
            yield _sse(
                {
                    "type": "done",
                    "stopReason": final.stop_reason,
                    "inputTokens": final.usage.input_tokens,
                    "outputTokens": final.usage.output_tokens,
                }
            )
    except AuthenticationError as exc:
        yield _sse({"type": "error", "message": f"Auth: {exc.message}"})
    except APIError as exc:
        yield _sse({"type": "error", "message": f"Upstream: {exc.message}"})
    except Exception as exc:
        yield _sse({"type": "error", "message": f"Unexpected: {exc}"})


def _sse(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


@app.post("/api/v1/copilot/chat")
async def chat(req: ChatRequest):
    if _client is None:
        raise HTTPException(
            503,
            "ANTHROPIC_API_KEY not configured. Set it in deploy/.env and restart the stack.",
        )
    return StreamingResponse(
        _stream_anthropic(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
