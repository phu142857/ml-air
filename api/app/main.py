from fastapi import FastAPI

from app.api.routes.v1 import router as v1_router
from app.services.db_service import init_db

app = FastAPI(title="ml-air-api", version="0.1.0")
app.include_router(v1_router, prefix="/v1")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
