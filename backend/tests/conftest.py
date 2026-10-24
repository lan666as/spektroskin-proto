import os
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

os.environ.setdefault("JWT_SECRET", "test-only-secret")


def _test_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set (run via scripts/gate.sh)")
    if not make_url(url).database.endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL must point at a *_test database")
    return url


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    url = _test_database_url()
    admin = create_engine(make_url(url).set(database="postgres"), isolation_level="AUTOCOMMIT")
    name = make_url(url).database
    with admin.connect() as conn:
        exists = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": name})
        if not exists.scalar():
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()

    from alembic import command
    from alembic.config import Config

    os.environ["DATABASE_URL"] = url
    command.upgrade(Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini")), "head")

    engine = create_engine(url)
    yield engine
    engine.dispose()


@pytest.fixture
def db(db_engine: Engine) -> Iterator[Session]:
    """A session inside a transaction that is rolled back after each test."""
    with db_engine.connect() as conn:
        trans = conn.begin()
        session = Session(bind=conn, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()
            trans.rollback()
