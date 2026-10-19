"""Authoritative, least-privilege inventory of Orchestra engines.

This API describes *installed/admitted backend adapters*, NOT project marketing claims.
It deliberately does not expose executable paths, hashes, environment values or tokens.
"""
from __future__ import annotations

from typing import TypedDict

from wordcraft_engine import available as wordcraft_available


class Capability(TypedDict):
    id: str
    status: str
    operations: list[str]
    outputFormats: list[str]
    runtimeVerified: bool


ENGINE_IDS = (
    "wordcraft", "deckcraft", "vectorcraft", "photocraft",
    "pdfcraft", "effectcraft", "designcraft",
)


def orchestra_capabilities() -> dict:
    """Only WordCraft currently has an executable adapter; others are not routable."""
    tools: list[Capability] = []
    for name in ENGINE_IDS:
        configured = name == "wordcraft" and wordcraft_available()
        tools.append({
            "id": name,
            "status": "configured" if configured else "unavailable",
            "operations": ["convert-markdown"] if configured else [],
            "outputFormats": ["docx", "pdf"] if configured else [],
            # A configured executable is NOT proof of a real successful conversion.
            "runtimeVerified": False,
        })
    return {
        "schemaVersion": 1,
        "execution": "family-gateway",
        "engines": tools,
    }
