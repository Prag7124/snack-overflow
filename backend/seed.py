import asyncio
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from sqlalchemy import select
from app.database import AsyncSessionLocal, Base, engine
from app.models import Activity, Snack, User, Vote

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_USERS = [
    {
        "name": "Priya Admin",
        "email": "admin@snackoverflow.dev",
        "password": "admin123",
        "role": "admin",
    },
    {
        "name": "Arjun Member",
        "email": "member@snackoverflow.dev",
        "password": "member123",
        "role": "member",
    },
]

INITIAL_SNACKS = [
    # Stocked items
    {"name": "Dark Chocolate Digestives", "category": "sweet", "quantity": 18, "low_stock_threshold": 5},
    {"name": "Peri-Peri Makhana", "category": "healthy-ish", "quantity": 15, "low_stock_threshold": 5},
    {"name": "Cold Brew Coffee Cans", "category": "drink", "quantity": 20, "low_stock_threshold": 6},
    {"name": "Classic Salted Kettle Chips", "category": "savoury", "quantity": 14, "low_stock_threshold": 4},
    {"name": "Roasted Almonds & Cranberries", "category": "healthy-ish", "quantity": 12, "low_stock_threshold": 4},
    {"name": "Matcha Oat Latte", "category": "drink", "quantity": 10, "low_stock_threshold": 4},
    # Running low items (quantity <= low_stock_threshold and > 0)
    {"name": "Masala Banana Chips", "category": "savoury", "quantity": 3, "low_stock_threshold": 5},
    {"name": "Almond Croissants", "category": "sweet", "quantity": 2, "low_stock_threshold": 4},
    {"name": "Sparkling Yuzu Water", "category": "drink", "quantity": 4, "low_stock_threshold": 5},
    {"name": "Peanut Butter Protein Bars", "category": "healthy-ish", "quantity": 3, "low_stock_threshold": 5},
    # Gone items (quantity == 0)
    {"name": "Spicy Nacho Tortillas", "category": "savoury", "quantity": 0, "low_stock_threshold": 5},
    {"name": "Hazelnut Brownie Bites", "category": "sweet", "quantity": 0, "low_stock_threshold": 4},
]


async def seed():
    # Ensure tables exist before seeding
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # 1. Upsert Demo Users (idempotent check by email)
        users_by_email = {}
        for u_data in DEMO_USERS:
            result = await session.execute(select(User).where(User.email == u_data["email"]))
            user = result.scalar_one_or_none()
            if not user:
                user = User(
                    name=u_data["name"],
                    email=u_data["email"],
                    password_hash=pwd_context.hash(u_data["password"]),
                    role=u_data["role"],
                )
                session.add(user)
                await session.flush()
            users_by_email[u_data["email"]] = user

        # 2. Upsert Demo Snacks (idempotent check by name)
        snacks_by_name = {}
        for s_data in INITIAL_SNACKS:
            result = await session.execute(select(Snack).where(Snack.name == s_data["name"]))
            snack = result.scalar_one_or_none()
            if not snack:
                snack = Snack(**s_data)
                session.add(snack)
                await session.flush()
            snacks_by_name[s_data["name"]] = snack

        # 3. Seed Sample Votes (only if none exist yet so re-runs stay idempotent)
        existing_votes = await session.execute(select(Vote).limit(1))
        if not existing_votes.scalar_one_or_none():
            admin_user = users_by_email["admin@snackoverflow.dev"]
            member_user = users_by_email["member@snackoverflow.dev"]
            sample_votes = [
                Vote(user_id=admin_user.id, snack_id=snacks_by_name["Peri-Peri Makhana"].id),
                Vote(user_id=member_user.id, snack_id=snacks_by_name["Peri-Peri Makhana"].id),
                Vote(user_id=member_user.id, snack_id=snacks_by_name["Cold Brew Coffee Cans"].id),
                Vote(user_id=admin_user.id, snack_id=snacks_by_name["Masala Banana Chips"].id),
            ]
            session.add_all(sample_votes)

        # 4. Seed Sample 7-Day Activity History (only if none exist yet)
        existing_activities = await session.execute(select(Activity).limit(1))
        if not existing_activities.scalar_one_or_none():
            admin_user = users_by_email["admin@snackoverflow.dev"]
            member_user = users_by_email["member@snackoverflow.dev"]
            now = datetime.now(timezone.utc)
            sample_activities = [
                Activity(
                    user_id=admin_user.id,
                    snack_id=snacks_by_name["Cold Brew Coffee Cans"].id,
                    action="restocked",
                    amount=25,
                    created_at=now - timedelta(days=5),
                ),
                Activity(
                    user_id=member_user.id,
                    snack_id=snacks_by_name["Cold Brew Coffee Cans"].id,
                    action="consumed",
                    amount=5,
                    created_at=now - timedelta(days=2),
                ),
                Activity(
                    user_id=member_user.id,
                    snack_id=snacks_by_name["Masala Banana Chips"].id,
                    action="consumed",
                    amount=7,
                    created_at=now - timedelta(days=1),
                ),
                Activity(
                    user_id=member_user.id,
                    snack_id=snacks_by_name["Peri-Peri Makhana"].id,
                    action="consumed",
                    amount=4,
                    created_at=now - timedelta(hours=6),
                ),
            ]
            session.add_all(sample_activities)

        await session.commit()
        print("Seed completed successfully!")
        print("  Admin  -> admin@snackoverflow.dev / admin123")
        print("  Member -> member@snackoverflow.dev / member123")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
