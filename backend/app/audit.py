import uuid

from sqlalchemy.orm import Session

from app.models import AuditEvent, User


def record(
    session: Session, actor: User | uuid.UUID, action: str, entity_type: str, entity_id: object
) -> None:
    """Append an audit event in the caller's transaction (every read/write of patient data)."""
    actor_id = actor.id if isinstance(actor, User) else actor
    session.add(
        AuditEvent(
            actor_id=actor_id, action=action, entity_type=entity_type, entity_id=str(entity_id)
        )
    )
