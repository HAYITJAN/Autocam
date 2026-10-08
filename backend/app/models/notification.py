from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import IdentityPK, json_column, pg_enum
from app.models.enums import NotificationState, NotificationType


class Notification(IdentityPK, Base):
    """One row per recipient so read/archive state is per user."""

    __tablename__ = "notifications"
    __table_args__: Any = (
        Index("ix_notifications_user_state_created", "user_id", "state", text("created_at DESC")),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(pg_enum(NotificationType, "notification_type"))
    category: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    link: Mapped[str | None] = mapped_column(String(300))
    payload: Mapped[dict[str, Any]] = json_column()
    state: Mapped[NotificationState] = mapped_column(
        pg_enum(NotificationState, "notification_state"),
        default=NotificationState.UNREAD,
        server_default=NotificationState.UNREAD.value,
    )
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
