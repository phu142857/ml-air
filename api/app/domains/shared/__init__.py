"""Shared infrastructure (database, no business domain)."""

from app.services import db_service

__all__ = ["db_service"]
