from collections.abc import Awaitable, Callable
from enum import StrEnum
from http import HTTPStatus
from typing import Any, cast

import structlog
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.common import ErrorBody, ErrorResponse, FieldError

logger = structlog.get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


class ErrorCode(StrEnum):
    BAD_REQUEST = "BAD_REQUEST"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"  # noqa: S105
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    CONFLICT = "CONFLICT"
    INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
    RATE_LIMITED = "RATE_LIMITED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


_STATUS_TO_CODE: dict[int, ErrorCode] = {
    400: ErrorCode.BAD_REQUEST,
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    409: ErrorCode.CONFLICT,
    413: ErrorCode.FILE_TOO_LARGE,
    415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
    503: ErrorCode.SERVICE_UNAVAILABLE,
}


class AppError(Exception):
    status_code: int = int(HTTPStatus.BAD_REQUEST)
    code: str = ErrorCode.BAD_REQUEST
    message: str = "Request could not be processed"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.status_code = int(status_code or self.status_code)
        self.details = details
        self.headers = headers
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = HTTPStatus.NOT_FOUND
    code = ErrorCode.NOT_FOUND
    message = "Resource was not found"

    def __init__(self, entity: str | None = None, **kwargs: Any) -> None:
        if entity:
            kwargs.setdefault("code", f"{entity.upper().replace(' ', '_')}_NOT_FOUND")
            kwargs.setdefault("message", f"{entity.capitalize()} was not found")
        super().__init__(**kwargs)


class UnauthorizedError(AppError):
    status_code = HTTPStatus.UNAUTHORIZED
    code = ErrorCode.UNAUTHORIZED
    message = "Authentication is required"


class ForbiddenError(AppError):
    status_code = HTTPStatus.FORBIDDEN
    code = ErrorCode.FORBIDDEN
    message = "You do not have permission to perform this action"


class ConflictError(AppError):
    status_code = HTTPStatus.CONFLICT
    code = ErrorCode.CONFLICT
    message = "Resource conflicts with the current state"


class ServiceUnavailableError(AppError):
    status_code = HTTPStatus.SERVICE_UNAVAILABLE
    code = ErrorCode.SERVICE_UNAVAILABLE
    message = "Service is temporarily unavailable"


def _request_id(request: Request) -> str | None:
    value = getattr(request.state, "request_id", None)
    return value if isinstance(value, str) else None


def error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = _request_id(request)
    body = ErrorResponse(
        error=ErrorBody(code=code, message=message, details=details, request_id=request_id)
    )
    response_headers = dict(headers or {})
    if request_id:
        response_headers[REQUEST_ID_HEADER] = request_id
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(body),
        headers=response_headers,
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return error_response(
        request,
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
        headers=exc.headers,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _STATUS_TO_CODE.get(exc.status_code, ErrorCode.BAD_REQUEST)
    message = exc.detail if isinstance(exc.detail, str) else HTTPStatus(exc.status_code).phrase
    return error_response(
        request,
        status_code=exc.status_code,
        code=code,
        message=message,
        headers=dict(exc.headers) if exc.headers else None,
    )


def _format_location(location: tuple[int | str, ...]) -> str:
    parts = [str(part) for part in location if part not in ("body", "query", "path", "header")]
    return ".".join(parts) or "request"


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = [
        FieldError(field=_format_location(tuple(err.get("loc", ()))), message=err.get("msg", ""))
        for err in exc.errors()
    ]
    return error_response(
        request,
        status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
        code=ErrorCode.VALIDATION_ERROR,
        message="Request validation failed",
        details=details,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        request_id=_request_id(request),
        exc_info=exc,
    )
    return error_response(
        request,
        status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
        code=ErrorCode.INTERNAL_ERROR,
        message="An unexpected error occurred",
    )


_ExceptionHandler = Callable[[Request, Exception], Awaitable[Response]]


def register_exception_handlers(app: FastAPI) -> None:
    handlers: dict[type[Exception], Callable[..., Awaitable[Response]]] = {
        AppError: app_error_handler,
        StarletteHTTPException: http_exception_handler,
        RequestValidationError: validation_exception_handler,
        Exception: unhandled_exception_handler,
    }
    for exc_class, handler in handlers.items():
        app.add_exception_handler(exc_class, cast(_ExceptionHandler, handler))
