from __future__ import annotations

from typing import Any


class _ReferencePlugin:
    """Minimal plugin object for API registry + /plugins/{name}/validate."""

    meta: dict[str, Any]

    def validate(self, context: dict[str, Any]) -> bool:
        return True


class AppEtlAdapterPlugin(_ReferencePlugin):
    meta = {
        "name": "app_etl_adapter",
        "version": "0.1.0",
        "engine_version": "1.0.0",
        "inputs": {},
        "outputs": {},
        "ui_schema": None,
        "lineage": None,
    }


class AppTrainAdapterPlugin(_ReferencePlugin):
    meta = {
        "name": "app_train_adapter",
        "version": "0.1.0",
        "engine_version": "1.0.0",
        "inputs": {},
        "outputs": {},
        "ui_schema": None,
        "lineage": None,
    }


class EchoTrackingPlugin(_ReferencePlugin):
    meta = {
        "name": "echo_tracking",
        "version": "0.1.0",
        "engine_version": "1.0.0",
        "inputs": {},
        "outputs": {},
        "ui_schema": None,
        "lineage": None,
    }
