from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+psycopg://spektroskin:spektroskin@localhost:5432/spektroskin"
    jwt_secret: str
    jwt_expiry_hours: int = 24
    storage_dir: Path = Path("/data/storage")
    simulator_dir: Path = Path(__file__).resolve().parent.parent / "simulator" / "out"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:8480"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
