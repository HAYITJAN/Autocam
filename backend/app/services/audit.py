import ipaddress
from dataclasses import dataclass
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

USER_AGENT_MAX = 500


@dataclass(frozen=True, slots=True)
class ClientInfo:
    ip_address: str | None
    user_agent: str | None

    @classmethod
    def from_request(cls, request: Request) -> "ClientInfo":
        host = request.client.host if request.client else None
        try:
            ip = str(ipaddress.ip_address(host)) if host else None
        except ValueError:
            ip = None
        agent = request.headers.get("user-agent")
        return cls(ip_address=ip, user_agent=agent[:USER_AGENT_MAX] if agent else None)


def record_audit(
    session: AsyncSession,
    action: str,
    *,
    user_id: int | None,
    client: ClientInfo | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    """Adds an audit row to the current transaction (committed with the business change)."""
    session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            ip_address=client.ip_address if client else None,
            user_agent=client.user_agent if client else None,
            meta=meta or {},
        )
    )
