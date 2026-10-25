from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser, authenticate, create_access_token
from app.config import get_settings
from app.db import get_session
from app.models import User
from app.schemas import Role, Token, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token", response_model=Token)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_session)],
) -> Token:
    user = authenticate(session, form.username, form.password)
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user), user=UserOut.model_validate(user))


class DemoLogin(BaseModel):
    role: Role


@router.post("/demo", response_model=Token)
def demo_login(body: DemoLogin, session: Annotated[Session, Depends(get_session)]) -> Token:
    """Sign in as the seeded demo user of a role without a password; only when DEMO_LOGIN is on."""
    if not get_settings().demo_login:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    user = session.scalar(select(User).where(User.username == body.role))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demo user not provisioned")
    return Token(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
