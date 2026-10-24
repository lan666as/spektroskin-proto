import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User


def test_user_role_is_constrained(db: Session) -> None:
    db.add(User(username="x", display_name="X", role="admin", password_hash="h"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_username_is_unique(db: Session) -> None:
    db.add(User(username="dup", display_name="A", role="clinician", password_hash="h"))
    db.flush()
    db.add(User(username="dup", display_name="B", role="clinician", password_hash="h"))
    with pytest.raises(IntegrityError):
        db.flush()
