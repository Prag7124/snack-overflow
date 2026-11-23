# Snack Overflow

An office pantry tracker built with **FastAPI**, **PostgreSQL**, and **React (TypeScript + Tailwind CSS)**. It lets team members check live snack stock, vote for restocks, grab snacks without overselling, and use a built-in Pantry Copilot to check inventory or generate pickup passes.

- **Live App:** `https://snack-overflow-web-qzyd.onrender.com/`
- **Live API Docs:** `https://snack-overflow-api-f0xi.onrender.com/docs`

---

## 1. Demo Credentials

| Role | Name | Email & Password | What They Can Do |
| :--- | :--- | :--- | :--- |
| **Admin** | `suma` | `[suma@gmail.com AND Suma1234]` | Add, edit, delete, and restock snacks; view restock alerts; consume and vote |
| **Member** | `deva` | `[deva@gmail.com AND deva123]` | Filter/search snacks, consume snacks, vote/unvote, use Pantry Copilot & pickup passes |

---

## 2. How to Run Locally

### Backend (FastAPI + PostgreSQL)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Add your DATABASE_URL, SECRET_KEY, and GEMINI_API_KEY in .env

# Seed demo users and sample snacks
python -m app.seed

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

### Running Tests
```bash
cd backend
pytest
```
Includes tests for login, role permissions, duplicate vote prevention, and concurrent `consume` requests to verify stock never goes below `0`.

---

## 3. Database Schema

1. **`users`**: `id`, `name`, `email` (unique), `hashed_password` (hashed with bcrypt, never stored as plain text), `role` (`admin` or `member`).
2. **`snacks`**: `id`, `name` (unique), `category` (`sweet`, `savoury`, `drink`, `healthy-ish`), `quantity` (integer, never below `0`), `low_stock_threshold` (default `5`).
   - *Note on status:* `stocked`, `running_low`, and `gone` are calculated from `quantity` and `low_stock_threshold` instead of stored in a column, so status never gets out of sync with actual stock.
3. **`votes`**: `id`, `user_id`, `snack_id`, `created_at`.
   - Has a database `UNIQUE (user_id, snack_id)` constraint so one user can only vote once per snack.
4. **`activity`**: `id`, `user_id`, `snack_id`, `action` (`consumed` or `restocked`), `amount`, `created_at`.
   - Saved in the same database transaction whenever stock changes so the history log always matches the numbers.
5. **`orders` & `order_items`** *(added feature)*: Stores pickup passes (`ORD-XXXX`) when users order snacks through the UI or Pantry Copilot, decrementing stock and logging `consumed` activity in the same transaction.

---

## 4. API Endpoints

Errors across the API follow one consistent format:
```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Someone beat you to the last packet!"
  }
}
```

- **Auth:** `POST /auth/login`
- **Snacks:**
  - `GET /snacks` (supports `?category=`, `?status=`, `?search=`, `?page=`, `?limit=`)
  - `GET /snacks/summary` (counts by status + Snack of the Week)
  - `GET /snacks/{id}`
  - `POST /snacks`, `PATCH /snacks/{id}`, `DELETE /snacks/{id}` *(Admin only)*
  - `POST /snacks/{id}/consume` (body: `{ "amount": 1 }`)
  - `POST /snacks/{id}/restock` *(Admin only)*
  - `POST /snacks/{id}/vote` & `DELETE /snacks/{id}/vote`
- **Orders & Copilot:**
  - `POST /orders` & `GET /orders/me`
  - `GET /copilot/recommendations` & `POST /copilot/ask`

---

## 5. Concurrency & Authorization

### Concurrency
- **Preventing Double-Grabs:** Checking `if snack.quantity > 0` in Python is unsafe because two requests can read `1` at the exact same time. Instead, the `consume` endpoint locks the snack row inside a PostgreSQL transaction (`SELECT ... FOR UPDATE`) and checks `quantity >= 0` at the database level. If 10 people try to grab the last 3 packets at once, the first 3 succeed and the other 7 get a `409 Conflict` response.
- **One Vote Per User:** Enforced directly by a `UNIQUE (user_id, snack_id)` constraint in PostgreSQL, so even two simultaneous clicks cannot create duplicate votes.

### Authorization
- **Server-Side Role Checks:** Every protected route checks the user's JWT token on the backend. Admin routes (`add`, `edit`, `delete`, `restock`) check `role == "admin"` on the server and return `403 Forbidden` if a regular member calls them directly.
- **Pantry Copilot Safety:** The copilot reads the user's identity and role from the verified login token (not from chat messages) and falls back to a local rule-based handler if the Gemini API is unavailable.

---

## 6. Design Note

### Key Decisions & Trade-offs
- **Calculating status instead of storing it:** Prevents bugs where `quantity` is `0` but a stored status column still says `stocked`. The trade-off is running a simple condition on read, which is fast for a snack list.
- **Database row locking (`FOR UPDATE`) on consume:** Slightly slows down simultaneous writes to the exact same snack row, which is a worthwhile trade-off because accuracy matters more than high write speed for office snacks.
- **Hybrid Pantry Copilot:** Keeps database updates (`Order`, `Vote`, `Restock`) in deterministic backend functions rather than letting the AI modify the database directly, with a built-in fallback if the external API times out.

### What Would Break First at 100× Users
1. **Database connections & row locks:** If hundreds of people tried to consume the same snack at the exact same second, requests waiting on the row lock would pile up and hit database connection limits. *Fix:* Add connection pooling (like PgBouncer) and cache read-heavy endpoints.
2. **Slower dashboard & summary queries:** As the `activity` table grows to hundreds of thousands of rows, calculating status summaries and top snacks on every page load would slow down. *Fix:* Add database indexes on `activity(snack_id, created_at)` and cache summary stats for a few seconds.
3. **External Gemini API limits:** Sending a live API call for every chat question would hit rate limits at 100× traffic. *Fix:* Cache answers for common questions like *"what's in stock?"* instead of calling the API every time.