"""Compatibility exports for the application-level domain event registry."""

from __future__ import annotations

from app.domain_event_registry import event_class_for_type, known_event_types

__all__ = ["event_class_for_type", "known_event_types"]
