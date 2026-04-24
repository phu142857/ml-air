from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from jsonschema import ValidationError, validate
from packaging.version import Version
from pydantic import BaseModel, Field

MIN_ENGINE_VERSION = Version("1.0.0")


class PluginMeta(BaseModel):
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    engine_version: str = Field(min_length=1)
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    ui_schema: dict[str, Any] | None = None

    def assert_compatible(self) -> None:
        if Version(self.engine_version) < MIN_ENGINE_VERSION:
            raise ValueError(
                f"plugin '{self.name}' requires engine_version={self.engine_version}, "
                f"minimum supported is {MIN_ENGINE_VERSION}"
            )


class PluginInterface(ABC):
    meta: PluginMeta

    @abstractmethod
    def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def validate(self, context: dict[str, Any]) -> bool:
        self.validate_input_schema(context)
        result = self.execute(context)
        self.validate_output_schema(result)
        return True

    def validate_input_schema(self, context: dict[str, Any]) -> None:
        self.meta.assert_compatible()
        if self.meta.inputs:
            validate(instance=context, schema=self.meta.inputs)

    def validate_output_schema(self, output: dict[str, Any]) -> None:
        if self.meta.outputs:
            validate(instance=output, schema=self.meta.outputs)


__all__ = [
    "PluginMeta",
    "PluginInterface",
    "ValidationError",
]
