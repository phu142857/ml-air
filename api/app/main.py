from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.v1 import router as v1_router
from app.services.db_service import assert_db_connection

app = FastAPI(title="ml-air-api", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(v1_router, prefix="/v1")


@app.on_event("startup")
def on_startup() -> None:
    assert_db_connection()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
