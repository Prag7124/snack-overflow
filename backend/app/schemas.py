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



class CreateUserRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    role: Literal["admin", "member"] = "member"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=6, max_length=100)

# --- Snack Schemas ---
SnackCategory = Literal["sweet", "savoury", "drink", "healthy-ish"]
SnackStatus = Literal["stocked", "running_low", "gone"]


class SnackCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    category: SnackCategory
    quantity: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=5, ge=0)
    image_url: str | None = Field(default=None, max_length=500)


class SnackUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    category: SnackCategory | None = None
    low_stock_threshold: int | None = Field(default=None, ge=0)
    image_url: str | None = Field(default=None, max_length=500)


class StockAdjustRequest(BaseModel):
    amount: int = Field(default=1, ge=1, le=100)


class SnackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: SnackCategory
    quantity: int
    low_stock_threshold: int
    image_url: str | None = None
    status: SnackStatus
    vote_count: int = 0
    user_has_voted: bool = False
    created_at: datetime


# --- Order / Pickup Pass Schemas ---
class OrderItemInput(BaseModel):
    snack_id: UUID
    quantity: int = Field(..., ge=1, le=50)


class OrderCreateRequest(BaseModel):
    items: list[OrderItemInput] = Field(..., min_length=1, max_length=25)


class OrderItemOut(BaseModel):
    snack_id: UUID | None
    snack_name: str
    quantity: int


class OrderOut(BaseModel):
    id: UUID
    order_code: str
    user_id: UUID
    user_name: str
    user_email: str
    status: Literal["pending_pickup", "handed_over"]
    total_items: int
    items: list[OrderItemOut]
    created_at: datetime


# --- Activity Schemas ---
ActivityAction = Literal["consumed", "restocked", "voted"]


class ActivityOut(BaseModel):
    id: UUID
    user_name: str
    user_email: str
    snack_name: str
    action: ActivityAction
    amount: int
    order_code: str | None = None
    created_at: datetime


class ActivitySummaryOut(BaseModel):
    total_consumed_7d: int
    total_restocked_7d: int
    top_consumed_snack: str | None
    items: list[ActivityOut]


# --- Copilot Schemas ---
class CopilotAskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=500)


class RestockRecommendation(BaseModel):
    snack_id: UUID
    snack_name: str
    category: SnackCategory
    current_quantity: int
    status: SnackStatus
    vote_count: int
    consumed_7d: int
    suggested_restock_qty: int
    priority: Literal["high", "medium", "low"]
    reason: str


class CopilotResponse(BaseModel):
    answer: str
    role_mode: Literal["admin", "member"]
    source: Literal["gemini", "smart-fallback"]
    recommendations: list[RestockRecommendation] = []
    action_type: Literal[
        "none",
        "order_confirm",
        "order_created",
        "vote_added",
        "restocked",
        "orders_list",
    ] = "none"
    pending_order_items: list[OrderItemOut] = []
    created_order: OrderOut | None = None
    user_orders: list[OrderOut] = []
