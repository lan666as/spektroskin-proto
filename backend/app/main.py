from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api import audit, auth, captures, cases, images, lesions, patients, simulator, validation
from app.config import get_settings
from app.db import get_engine

app = FastAPI(
    title="SpektroSkin prototype API",
    version="0.1.0",
    description="Research prototype. Optical module is simulated; no diagnostic output.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


@api.get("/health", tags=["health"], response_model=dict[str, str])
def health():
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "degraded", "database": "unreachable"}, status_code=503)
    return {"status": "ok", "database": "ok"}


for module in (auth, patients, lesions, captures, cases, images, validation, audit, simulator):
    api.include_router(module.router)
app.include_router(api)
