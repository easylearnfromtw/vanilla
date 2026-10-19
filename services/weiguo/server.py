"""Deprecated import path for 衞國 Browser Service.

Keep one FastAPI application. Deploy app:app; server:app is an alias, not a
separate worker with conflicting CORS, token or domain authorization rules.
"""
from app import app
