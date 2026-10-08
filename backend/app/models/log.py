from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import IdentityPK, json_column, pg_enum
from app.models.enums import LogLevel


class AuditLog(IdentityPK, Base):
    """Append-only record of security-relevant and business-critical actions."""

    __tablename__ = "audit_logs"
    __table_args__: Any = (
        Index("ix_audit_logs_created_at", text("created_at DESC")),
        Index("ix_audit_logs_user_created", "user_id", text("created_at DESC")),
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_action_created", "action", text("created_at DESC")),
    )

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(500))
    meta: Mapped[dict[str, Any]] = json_column("metadata")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SystemLog(IdentityPK, Base):
    __tablename__ = "system_logs"
    __table_args__: Any = (
        Index("ix_system_logs_level_created", "level", text("created_at DESC")),
        Index("ix_system_logs_source_created", "source", text("created_at DESC")),
    )

    level: Mapped[LogLevel] = mapped_column(pg_enum(LogLevel, "log_level"))
    source: Mapped[str] = mapped_column(String(30))
    event_code: Mapped[str | None] = mapped_column(String(60))
    message: Mapped[str] = mapped_column(Text)
    context: Mapped[dict[str, Any]] = json_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
