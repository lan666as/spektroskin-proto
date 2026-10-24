from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Dermatologist
from app.db import get_session
from app.models import AuditEvent, User
from app.schemas import AuditEventOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEventOut])
def list_audit(
    _: Dermatologist,
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    before: Annotated[datetime | None, Query(description="Cursor: events strictly older")] = None,
    entity_type: Annotated[str | None, Query(max_length=32)] = None,
) -> list[AuditEventOut]:
    """Newest first. Page with `before` = the `at` of the last event received."""
    query = (
        select(AuditEvent, User)
        .join(User, User.id == AuditEvent.actor_id)
        .order_by(AuditEvent.at.desc())
        .limit(limit)
    )
    if before is not None:
        query = query.where(AuditEvent.at < before)
    if entity_type:
        query = query.where(AuditEvent.entity_type == entity_type)
    return [
        AuditEventOut(
            id=event.id,
            at=event.at,
            actor=user.display_name,
            actor_role=user.role,
            action=event.action,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
        )
        for event, user in session.execute(query)
    ]
