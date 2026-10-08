from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PageMeta(ApiModel):
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)
    pages: int = Field(ge=0)


class ApiResponse[T](ApiModel):
    success: Literal[True] = True
    data: T
    meta: PageMeta | dict[str, Any] | None = None


class FieldError(ApiModel):
    field: str
    message: str


class ErrorBody(ApiModel):
    code: str = Field(examples=["CAMERA_NOT_FOUND"])
    message: str = Field(examples=["Camera was not found"])
    details: list[FieldError] | dict[str, Any] | list[dict[str, Any]] | None = None
    request_id: str | None = None


class ErrorResponse(ApiModel):
    success: Literal[False] = False
    error: ErrorBody


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI `responses` mapping documenting the error envelope for the given status codes."""
    return {code: {"model": ErrorResponse} for code in status_codes}
