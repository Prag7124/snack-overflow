from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app import models  # noqa: F401
from app.database import Base, engine
from app.errors import register_exception_handlers
from app.routers import activity, auth, copilot, events, orders, snacks


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="Snack Overflow API", version="1.0.0", lifespan=lifespan)

register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_path = Path(__file__).resolve().parent.parent / "uploads"
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

app.include_router(auth.router)
app.include_router(snacks.router)
app.include_router(orders.router)
app.include_router(events.router)
app.include_router(activity.router)
app.include_router(copilot.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
