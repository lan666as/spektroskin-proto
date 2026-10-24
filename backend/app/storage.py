"""Object storage. The database stores keys only; an S3-compatible adapter can replace
LocalStorage without touching callers."""

import os
import shutil
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from app.config import get_settings


class ObjectNotFound(KeyError):
    pass


class Storage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes: ...

    def delete_prefix(self, prefix: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError(f"invalid storage key: {key!r}")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent)
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)  # atomic: readers never see a half-written object

    def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise ObjectNotFound(key)
        return path.read_bytes()

    def delete_prefix(self, prefix: str) -> None:
        """Remove every object under a key prefix such as "captures/<id>/" (no-op if absent)."""
        path = self._path(prefix)
        if path.is_dir():
            shutil.rmtree(path)


@lru_cache
def get_storage() -> Storage:
    return LocalStorage(get_settings().storage_dir)


def raw_frame_key(capture_id: object, band: str) -> str:
    return f"captures/{capture_id}/raw/{band}.png"


def view_key(capture_id: object, name: str) -> str:
    return f"captures/{capture_id}/views/{name}.png"
