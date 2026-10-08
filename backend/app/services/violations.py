from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import ConflictError, ErrorCode, ForbiddenError, NotFoundError
from app.models import (
    Location,
    User,
    Vehicle,
    VehicleType,
    Violation,
    ViolationEvent,
    ViolationEvidence,
    ViolationType,
)
from app.models.enums import ViolationEventType, ViolationStatus
from app.schemas.common import PageMeta
from app.schemas.domain import (
    EvidenceOut,
    VehicleBrief,
    ViolationDetail,
    ViolationEventOut,
    ViolationListItem,
    ViolationSummary,
)
from app.services.audit import ClientInfo, record_audit
from app.services.common import (
    AnySelect,
    location_ref,
    paginate,
    user_ref,
    violation_item,
    violation_rows_stmt,
)
from app.services.timeutil import local_day_start, pct_change

PENDING = (ViolationStatus.NEW, ViolationStatus.UNDER_REVIEW)
REOPEN_ROLES = frozenset({"ADMINISTRATOR", "SUPERVISOR"})


class ViolationAction(StrEnum):
    REVIEW = "review"
    CONFIRM = "confirm"
    REJECT = "reject"
    ARCHIVE = "archive"
    REOPEN = "reopen"


@dataclass(frozen=True, slots=True)
class Transition:
    sources: frozenset[ViolationStatus]
    target: ViolationStatus
    permission: str
    audit_action: str


TRANSITIONS: dict[ViolationAction, Transition] = {
    ViolationAction.REVIEW: Transition(
        frozenset({ViolationStatus.NEW}), ViolationStatus.UNDER_REVIEW,
        "violations.review", "VIOLATION_REVIEW_STARTED",
    ),
    ViolationAction.CONFIRM: Transition(
        frozenset(PENDING), ViolationStatus.CONFIRMED, "violations.confirm", "VIOLATION_CONFIRMED"
    ),
    ViolationAction.REJECT: Transition(
        frozenset(PENDING), ViolationStatus.REJECTED, "violations.reject", "VIOLATION_REJECTED"
    ),
    ViolationAction.ARCHIVE: Transition(
        frozenset({ViolationStatus.CONFIRMED, ViolationStatus.REJECTED}),
        ViolationStatus.ARCHIVED, "violations.confirm", "VIOLATION_ARCHIVED",
    ),
    ViolationAction.REOPEN: Transition(
        frozenset({ViolationStatus.REJECTED}), ViolationStatus.UNDER_REVIEW,
        "violations.confirm", "VIOLATION_REOPENED",
    ),
}  # fmt: skip


class ViolationSort(StrEnum):
    OCCURRED_DESC = "-occurred_at"
    OCCURRED_ASC = "occurred_at"
    CONFIDENCE_DESC = "-ai_confidence"
    CONFIDENCE_ASC = "ai_confidence"
    CODE_DESC = "-code"


_SORT_COLUMNS: dict[ViolationSort, Any] = {
    ViolationSort.OCCURRED_DESC: Violation.occurred_at.desc(),
    ViolationSort.OCCURRED_ASC: Violation.occurred_at.asc(),
    ViolationSort.CONFIDENCE_DESC: Violation.ai_confidence.desc(),
    ViolationSort.CONFIDENCE_ASC: Violation.ai_confidence.asc(),
    ViolationSort.CODE_DESC: Violation.id.desc(),
}


@dataclass(slots=True)
class ViolationFilters:
    date_from: datetime | None = None
    date_to: datetime | None = None
    status: list[ViolationStatus] | None = None
    violation_type: list[str] | None = None
    camera_id: int | None = None
    location_id: int | None = None
    district_id: int | None = None
    vehicle_type: str | None = None
    vehicle_id: int | None = None
    plate: str | None = None
    search: str | None = None
    confidence_min: float | None = None
    confidence_max: float | None = None
    assigned_to: int | None = None

    def apply(self, stmt: AnySelect) -> AnySelect:
        conditions: list[Any] = []
        if self.date_from:
            conditions.append(Violation.occurred_at >= self.date_from)
        if self.date_to:
            conditions.append(Violation.occurred_at <= self.date_to)
        if self.status:
            conditions.append(Violation.status.in_(self.status))
        if self.violation_type:
            conditions.append(ViolationType.code.in_(self.violation_type))
        if self.camera_id:
            conditions.append(Violation.camera_id == self.camera_id)
        if self.location_id:
            conditions.append(Violation.location_id == self.location_id)
        if self.district_id:
            conditions.append(Location.district_id == self.district_id)
        if self.vehicle_type:
            conditions.append(VehicleType.code == self.vehicle_type)
        if self.vehicle_id:
            conditions.append(Violation.vehicle_id == self.vehicle_id)
        if self.plate:
            conditions.append(Violation.plate_number.contains(normalize_plate(self.plate)))
        if self.search:
            term = self.search.strip()
            conditions.append(
                Violation.code.ilike(f"%{term}%")
                | Violation.plate_number.contains(normalize_plate(term))
            )
        if self.confidence_min is not None:
            conditions.append(Violation.ai_confidence >= self.confidence_min)
        if self.confidence_max is not None:
            conditions.append(Violation.ai_confidence <= self.confidence_max)
        if self.assigned_to:
            conditions.append(Violation.assigned_to == self.assigned_to)
        return stmt.where(*conditions) if conditions else stmt


def normalize_plate(value: str) -> str:
    return "".join(ch for ch in value.upper() if ch.isalnum())


def allowed_actions(status: ViolationStatus, permissions: frozenset[str], role: str) -> list[str]:
    actions = [
        action.value
        for action, rule in TRANSITIONS.items()
        if status in rule.sources
        and rule.permission in permissions
        and (action is not ViolationAction.REOPEN or role in REOPEN_ROLES)
    ]
    if "violations.review" in permissions:
        actions.append("comment")
    return actions


class ViolationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def search(
        self, filters: ViolationFilters, page: int, page_size: int, sort: ViolationSort
    ) -> tuple[list[ViolationListItem], PageMeta]:
        stmt = filters.apply(violation_rows_stmt()).order_by(
            _SORT_COLUMNS[sort], Violation.id.desc()
        )
        rows, meta = await paginate(self.session, stmt, page, page_size)
        return [violation_item(row) for row in rows], meta

    async def recent(self, limit: int) -> list[ViolationListItem]:
        rows = await self.session.execute(
            violation_rows_stmt().order_by(Violation.occurred_at.desc()).limit(limit)
        )
        return [violation_item(row) for row in rows]

    async def summary(self, now: datetime, tz: Any) -> ViolationSummary:
        today = local_day_start(now, tz)
        yesterday = local_day_start(now, tz, 1)
        local = now.astimezone(tz)
        week = local_day_start(now, tz, local.weekday())
        month = local_day_start(now, tz, local.day - 1)
        row = (
            await self.session.execute(
                select(
                    func.count(),
                    func.count().filter(Violation.status == ViolationStatus.CONFIRMED),
                    func.count().filter(Violation.status.in_(PENDING)),
                    func.count().filter(Violation.status == ViolationStatus.REJECTED),
                    func.count().filter(Violation.occurred_at >= today),
                    func.count().filter(
                        Violation.occurred_at >= yesterday,
                        Violation.occurred_at < now - timedelta(days=1),
                    ),
                    func.count().filter(Violation.occurred_at >= week),
                    func.count().filter(Violation.occurred_at >= month),
                    func.count().filter(
                        Violation.occurred_at >= yesterday, Violation.occurred_at < today
                    ),
                )
            )
        ).one()
        total, confirmed, pending, rejected, today_n, same_time_yday, week_n, month_n, yday = row
        return ViolationSummary(
            total=total,
            confirmed=confirmed,
            pending=pending,
            rejected=rejected,
            today=today_n,
            yesterday=yday,
            this_week=week_n,
            this_month=month_n,
            today_delta_pct=pct_change(today_n, same_time_yday),
        )

    async def detail(
        self, violation_id: int, permissions: frozenset[str], role: str
    ) -> ViolationDetail:
        row = (
            await self.session.execute(violation_rows_stmt().where(Violation.id == violation_id))
        ).one_or_none()
        if row is None:
            raise NotFoundError("Violation")
        item = violation_item(row)
        violation: Violation = row[0]
        location = row[3]
        district = row[4]

        reviewer = (
            await self.session.get(User, violation.reviewed_by) if violation.reviewed_by else None
        )
        vehicle = (
            await self.session.get(Vehicle, violation.vehicle_id) if violation.vehicle_id else None
        )
        actor = aliased(User)
        events = await self.session.execute(
            select(ViolationEvent, actor)
            .outerjoin(actor, ViolationEvent.actor_id == actor.id)
            .where(ViolationEvent.violation_id == violation_id)
            .order_by(ViolationEvent.created_at, ViolationEvent.id)
        )
        evidence = await self.session.scalars(
            select(ViolationEvidence)
            .where(ViolationEvidence.violation_id == violation_id)
            .order_by(ViolationEvidence.id)
        )
        return ViolationDetail(
            **item.model_dump(),
            excess_speed=violation.excess_speed,
            direction=violation.direction,
            traffic_light_state=violation.traffic_light_state,
            track_id=violation.track_id,
            reviewed_by=user_ref(reviewer),
            reviewed_at=violation.reviewed_at,
            rejection_reason=violation.rejection_reason,
            created_at=violation.created_at,
            location=location_ref(location, district),
            vehicle=VehicleBrief.model_validate(vehicle) if vehicle else None,
            evidence=[EvidenceOut.model_validate(e) for e in evidence],
            events=[
                ViolationEventOut(
                    id=event.id,
                    event_type=event.event_type,
                    from_status=event.from_status,
                    to_status=event.to_status,
                    actor=user_ref(event_actor),
                    comment=event.comment,
                    created_at=event.created_at,
                )
                for event, event_actor in events
            ],
            allowed_actions=allowed_actions(violation.status, permissions, role),
            meta=violation.meta,
        )

    async def transition(
        self,
        violation_id: int,
        action: ViolationAction,
        *,
        user_id: int,
        permissions: frozenset[str],
        role: str,
        client: ClientInfo,
        comment: str | None = None,
    ) -> None:
        rule = TRANSITIONS[action]
        if rule.permission not in permissions or (
            action is ViolationAction.REOPEN and role not in REOPEN_ROLES
        ):
            raise ForbiddenError()
        violation = await self.session.scalar(
            select(Violation).where(Violation.id == violation_id).with_for_update()
        )
        if violation is None:
            raise NotFoundError("Violation")
        if violation.status not in rule.sources:
            raise ConflictError(
                f"Cannot {action.value} a violation in status {violation.status.value}",
                code=ErrorCode.INVALID_STATUS_TRANSITION,
                details={"from": violation.status.value, "action": action.value},
            )
        previous = violation.status
        now = datetime.now(UTC)
        violation.status = rule.target
        if action is ViolationAction.REVIEW and violation.assigned_to is None:
            violation.assigned_to = user_id
        if action in {ViolationAction.CONFIRM, ViolationAction.REJECT}:
            violation.reviewed_by = user_id
            violation.reviewed_at = now
        if action is ViolationAction.REJECT:
            violation.rejection_reason = comment
        if action is ViolationAction.REOPEN:
            violation.rejection_reason = None
            violation.assigned_to = user_id
        self.session.add(
            ViolationEvent(
                violation_id=violation.id,
                event_type=ViolationEventType.STATUS_CHANGED,
                from_status=previous,
                to_status=rule.target,
                actor_id=user_id,
                comment=comment,
                created_at=now,
            )
        )
        record_audit(
            self.session,
            rule.audit_action,
            user_id=user_id,
            client=client,
            entity_type="violation",
            entity_id=violation.id,
            meta={"from": previous.value, "to": rule.target.value, "comment": comment},
        )
        await self.session.commit()

    async def add_comment(
        self, violation_id: int, comment: str, *, user_id: int, client: ClientInfo
    ) -> None:
        exists = await self.session.scalar(select(Violation.id).where(Violation.id == violation_id))
        if exists is None:
            raise NotFoundError("Violation")
        self.session.add(
            ViolationEvent(
                violation_id=violation_id,
                event_type=ViolationEventType.COMMENT,
                actor_id=user_id,
                comment=comment,
            )
        )
        record_audit(
            self.session,
            "VIOLATION_COMMENTED",
            user_id=user_id,
            client=client,
            entity_type="violation",
            entity_id=violation_id,
        )
        await self.session.commit()

    async def types(self) -> list[ViolationType]:
        return list(await self.session.scalars(select(ViolationType).order_by(ViolationType.id)))
