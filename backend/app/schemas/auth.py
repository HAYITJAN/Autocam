from datetime import datetime

from pydantic import Field

from app.schemas.common import ApiModel


class LoginRequest(ApiModel):
    username_or_email: str = Field(min_length=1, max_length=255, examples=["admin"])
    password: str = Field(min_length=1, max_length=128)


class UserProfile(ApiModel):
    id: int
    username: str
    full_name: str
    email: str
    role: str = Field(examples=["ADMINISTRATOR"])
    role_name: str
    permissions: list[str]


class TokenResponse(ApiModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int = Field(description="Access token lifetime in seconds")
    expires_at: datetime
    user: UserProfile
