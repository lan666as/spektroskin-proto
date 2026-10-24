import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import audit
from app.auth import verify_image_signature
from app.db import get_session
from app.schemas import ViewName
from app.storage import ObjectNotFound, get_storage, view_key

router = APIRouter(prefix="/images", tags=["images"])


@router.get(
    "/{capture_id}/{name}",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
def get_image(
    capture_id: uuid.UUID,
    name: ViewName,
    sig: Annotated[str, Query(description="Signature from a capture's `views` URL")],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    viewer_id = verify_image_signature(sig, capture_id, name)
    try:
        data = get_storage().get(view_key(capture_id, name))
    except ObjectNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found") from exc
    audit.record(session, viewer_id, "read", "image", f"{capture_id}/{name}")
    session.commit()
    return Response(
        data, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"}
    )
