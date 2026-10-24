"""Demo auth: OAuth2 password flow, JWT bearer tokens, bcrypt password hashes.

Not production auth (no SSO, no password reset, no lockout); labeled "demo auth" in the UI.
"""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.models import User

ALGORITHM = "HS256"
IMAGE_URL_TTL = timedelta(hours=2)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def authenticate(session: Session, username: str, password: str) -> User | None:
    user = session.scalar(select(User).where(User.username == username))
    if user is None:
        # Spend the same bcrypt time for unknown users so timing does not reveal usernames.
        bcrypt.checkpw(b"x", _DUMMY_HASH)
        return None
    return user if verify_password(password, user.password_hash) else None


_DUMMY_HASH = bcrypt.hashpw(b"dummy", bcrypt.gensalt())


def create_access_token(user: User) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    claims = {
        "sub": str(user.id),
        "role": user.role,
        "purpose": "access",
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM)


def sign_image_url(capture_id: uuid.UUID, name: str, viewer_id: uuid.UUID) -> str:
    """Short-lived signed URL, so <img> tags can load views without an Authorization header."""
    now = datetime.now(UTC)
    claims = {
        "sub": str(viewer_id),
        "cap": str(capture_id),
        "img": name,
        "purpose": "image",
        "exp": now + IMAGE_URL_TTL,
    }
    token = jwt.encode(claims, get_settings().jwt_secret, algorithm=ALGORITHM)
    return f"/api/images/{capture_id}/{name}?sig={token}"


def verify_image_signature(sig: str, capture_id: uuid.UUID, name: str) -> uuid.UUID:
    """Returns the viewer id the URL was issued to; raises 403 on any mismatch."""
    try:
        claims = jwt.decode(sig, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Image link expired or invalid") from exc
    if (
        claims.get("purpose") != "image"
        or claims.get("cap") != str(capture_id)
        or claims.get("img") != name
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Image link expired or invalid")
    return uuid.UUID(claims["sub"])


_UNAUTHORIZED = HTTPException(
    status.HTTP_401_UNAUTHORIZED,
    "Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
        if claims.get("purpose") != "access":
            raise _UNAUTHORIZED
        user_id = uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise _UNAUTHORIZED from exc
    user = session.get(User, user_id)
    if user is None:
        raise _UNAUTHORIZED
    return user


def require_role(*roles: str) -> Callable[..., User]:
    def dependency(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for this role")
        return user

    return dependency


def same_group(user: User) -> Select[tuple[uuid.UUID]]:
    """Ids of users in the viewer's group: automated test accounts and real accounts never see
    each other's records in lists."""
    return select(User.id).where(User.is_test == user.is_test)


def authorize(session: Session, user: User, owner_id: uuid.UUID) -> None:
    """Per-object check for records owned by a clinician (the patient's registering clinician):
    clinicians reach only their own patients' records; dermatologists those of their group.
    404, not 403, so ids of other people's records are not confirmed."""
    if user.role == "clinician":
        allowed = owner_id == user.id
    else:
        owner = session.get(User, owner_id)
        allowed = owner is not None and owner.is_test == user.is_test
    if not allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")


CurrentUser = Annotated[User, Depends(current_user)]
Clinician = Annotated[User, Depends(require_role("clinician"))]
Dermatologist = Annotated[User, Depends(require_role("dermatologist"))]
