from __future__ import annotations

from fastapi import HTTPException


def identity_http_error(status_code: int, code: str, message: str, details: dict | None = None) -> HTTPException:
    body: dict = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return HTTPException(status_code=status_code, detail=body)


def invalid_credential(message: str = "Invalid username or password") -> HTTPException:
    return identity_http_error(401, "INVALID_CREDENTIAL", message)


def invalid_token(message: str = "Invalid or expired token") -> HTTPException:
    return identity_http_error(401, "INVALID_TOKEN", message)


def forbidden(message: str = "Forbidden") -> HTTPException:
    return identity_http_error(403, "FORBIDDEN", message)


def insufficient_scope(message: str = "Insufficient scope") -> HTTPException:
    return identity_http_error(403, "INSUFFICIENT_SCOPE", message)


def account_locked(message: str = "Account is locked") -> HTTPException:
    return identity_http_error(423, "ACCOUNT_LOCKED", message)


def account_disabled(message: str = "Account is disabled") -> HTTPException:
    return identity_http_error(403, "ACCOUNT_DISABLED", message)


def not_found(message: str = "Not found") -> HTTPException:
    return identity_http_error(404, "NOT_FOUND", message)


def duplicate_assignment(message: str = "Duplicate role assignment") -> HTTPException:
    return identity_http_error(409, "DUPLICATE_ASSIGNMENT", message)


def validation_error(message: str, details: dict | None = None) -> HTTPException:
    return identity_http_error(400, "VALIDATION_ERROR", message, details)
