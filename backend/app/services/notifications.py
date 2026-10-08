from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models import Notification
from app.models.enums import NotificationState, NotificationType
from app.schemas.common import PageMeta
from app.schemas.domain import NotificationOut, UnreadCount
from app.services.common import paginate


class NotificationService:
    def __init__(self, session: AsyncSession, user_id: int) -> None:
        self.session = session
        self.user_id = user_id

    async def search(
        self,
        state: NotificationState | None,
        type_: NotificationType | None,
        page: int,
        page_size: int,
    ) -> tuple[list[NotificationOut], PageMeta]:
        stmt = select(Notification).where(Notification.user_id == self.user_id)
        if state:
            stmt = stmt.where(Notification.state == state)
        else:
            stmt = stmt.where(Notification.state != NotificationState.ARCHIVED)
        if type_:
            stmt = stmt.where(Notification.type == type_)
        rows, meta = await paginate(
            self.session,
            stmt.order_by(Notification.created_at.desc(), Notification.id.desc()),
            page,
            page_size,
        )
        return [NotificationOut.model_validate(row[0]) for row in rows], meta

    async def unread_count(self) -> UnreadCount:
        rows = (
            await self.session.execute(
                select(Notification.type, func.count())
                .where(
                    Notification.user_id == self.user_id,
                    Notification.state == NotificationState.UNREAD,
                )
                .group_by(Notification.type)
            )
        ).all()
        by_type = {t.value: n for t, n in rows}
        return UnreadCount(total=sum(by_type.values()), by_type=by_type)

    async def set_state(self, notification_id: int, state: NotificationState) -> None:
        result = await self.session.execute(
            update(Notification)
            .where(Notification.id == notification_id, Notification.user_id == self.user_id)
            .values(
                state=state,
                read_at=datetime.now(UTC) if state is NotificationState.READ else None,
            )
            .returning(Notification.id)
        )
        if result.first() is None:
            raise NotFoundError("Notification")
        await self.session.commit()

    async def read_all(self) -> int:
        result = await self.session.execute(
            update(Notification)
            .where(
                Notification.user_id == self.user_id,
                Notification.state == NotificationState.UNREAD,
            )
            .values(state=NotificationState.READ, read_at=datetime.now(UTC))
            .returning(Notification.id)
        )
        count = len(result.all())
        await self.session.commit()
        return count
