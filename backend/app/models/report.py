from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import IdentityPK, json_column, pg_enum
from app.models.enums import ReportFormat, ReportStatus, ReportType


class Report(IdentityPK, Base):
    __tablename__ = "reports"
    __table_args__: Any = (
        Index("ix_reports_created_by_created", "created_by", text("created_at DESC")),
    )

    report_type: Mapped[ReportType] = mapped_column(pg_enum(ReportType, "report_type"))
    format: Mapped[ReportFormat] = mapped_column(pg_enum(ReportFormat, "report_format"))
    title: Mapped[str] = mapped_column(String(200))
    filters: Mapped[dict[str, Any]] = json_column()
    date_from: Mapped[datetime]
    date_to: Mapped[datetime]
    status: Mapped[ReportStatus] = mapped_column(
        pg_enum(ReportStatus, "report_status"),
        default=ReportStatus.PENDING,
        server_default=ReportStatus.PENDING.value,
        index=True,
    )
    storage_key: Mapped[str | None] = mapped_column(String(500))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    error_message: Mapped[str | None] = mapped_column(Text)
    task_id: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    completed_at: Mapped[datetime | None]
