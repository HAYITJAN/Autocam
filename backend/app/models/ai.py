from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    false,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.db.types import IdentityPK, json_column, pg_enum
from app.models.enums import AIModelTask

Threshold = Numeric(4, 3, asdecimal=False)


class AIModel(IdentityPK, TimestampMixin, Base):
    __tablename__ = "ai_models"
    __table_args__: Any = (
        UniqueConstraint("name", "version"),
        CheckConstraint("confidence_threshold BETWEEN 0 AND 1", name="confidence_threshold_range"),
        CheckConstraint("iou_threshold BETWEEN 0 AND 1", name="iou_threshold_range"),
    )

    name: Mapped[str] = mapped_column(String(100))
    version: Mapped[str] = mapped_column(String(30))
    framework: Mapped[str] = mapped_column(String(30))
    task: Mapped[AIModelTask] = mapped_column(pg_enum(AIModelTask, "ai_model_task"))
    weights_uri: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    confidence_threshold: Mapped[float] = mapped_column(
        Threshold, default=0.5, server_default="0.5"
    )
    iou_threshold: Mapped[float] = mapped_column(Threshold, default=0.45, server_default="0.45")
    vehicle_detection: Mapped[bool] = mapped_column(default=True, server_default=true())
    plate_recognition: Mapped[bool] = mapped_column(default=True, server_default=true())
    speed_detection: Mapped[bool] = mapped_column(default=True, server_default=true())
    red_light_detection: Mapped[bool] = mapped_column(default=True, server_default=true())
    parking_detection: Mapped[bool] = mapped_column(default=True, server_default=true())
    wrong_direction_detection: Mapped[bool] = mapped_column(default=True, server_default=true())
    is_active: Mapped[bool] = mapped_column(default=False, server_default=false())


class AIDetectionLog(IdentityPK, Base):
    """Windowed inference statistics per camera (one row per window, not per frame)."""

    __tablename__ = "ai_detection_logs"
    __table_args__: Any = (
        Index("ix_ai_detection_logs_camera_window", "camera_id", text("window_start DESC")),
    )

    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"))
    ai_model_id: Mapped[int | None] = mapped_column(
        ForeignKey("ai_models.id", ondelete="SET NULL"), index=True
    )
    window_start: Mapped[datetime]
    window_seconds: Mapped[int] = mapped_column(Integer)
    frames_processed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_inference_ms: Mapped[float | None] = mapped_column(Numeric(8, 2, asdecimal=False))
    objects_detected: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    plates_read: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    violations_detected: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    errors: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    payload: Mapped[dict[str, Any]] = json_column()
