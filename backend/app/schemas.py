from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --- Auth Schemas ---
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: EmailStr
    role: Literal["admin", "member"]
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Snack Schemas ---
SnackCategory = Literal["sweet", "savoury", "drink", "healthy-ish"]
SnackStatus = Literal["stocked", "running_low", "gone"]


class SnackCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    category: SnackCategory
    quantity: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=5, ge=0)


class SnackUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    category: SnackCategory | None = None
    low_stock_threshold: int | None = Field(default=None, ge=0)


class StockAdjustRequest(BaseModel):
    amount: int = Field(default=1, ge=1, le=100)


class SnackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: SnackCategory
    quantity: int
    low_stock_threshold: int
    status: SnackStatus
    vote_count: int = 0
    user_has_voted: bool = False
    created_at: datetime
