"""One-tap demo sign-in: off by default, and only ever signs in as the seeded demo users."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import auth as auth_api
from app.config import Settings
from app.models import User


def _demo_user(db: Session, role: str) -> User:
    user = db.scalar(select(User).where(User.username == role))
    if user is None:
        user = User(username=role, display_name=f"Demo {role}", role=role, password_hash="x")
        db.add(user)
        db.flush()
    return user


def _settings(monkeypatch: pytest.MonkeyPatch, enabled: bool) -> None:
    settings = Settings(jwt_secret="test-only-secret", demo_login=enabled)
    monkeypatch.setattr(auth_api, "get_settings", lambda: settings)


def test_demo_login_signs_in_as_seeded_user(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    _settings(monkeypatch, True)
    derm = _demo_user(db, "dermatologist")
    token = auth_api.demo_login(auth_api.DemoLogin(role="dermatologist"), db)
    assert token.user.id == derm.id and token.user.role == "dermatologist"


def test_demo_login_is_off_by_default(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    _settings(monkeypatch, False)
    _demo_user(db, "clinician")
    with pytest.raises(HTTPException) as err:
        auth_api.demo_login(auth_api.DemoLogin(role="clinician"), db)
    assert err.value.status_code == 404
