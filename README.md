# CipherSpend

CipherSpend is a privacy-first expense tracker that encrypts monetary values in the browser before sending data to the backend.

## Homomorphic Encryption (HE) in CipherSpend

CipherSpend uses **CKKS homomorphic encryption** (via Microsoft SEAL bindings) so the server can perform math on encrypted values without seeing raw amounts.

### Why HE is used

- Protects sensitive spending amounts from backend/database operators
- Enables encrypted aggregation (for totals/category sums) without decrypting on the server
- Keeps user-visible decryption in the client vault session

### Trust boundary

- **Browser (trusted by user):**
  - Generates keys
  - Encrypts amounts before upload
  - Decrypts values for display (total, chart, ledger)
- **Backend (untrusted for plaintext amounts):**
  - Stores ciphertext
  - Performs ciphertext aggregation
  - Never requires plaintext amounts for core analytics flow

### Crypto flow (practical)

1. User registers/unlocks with passphrase.
2. Browser initializes SEAL context and key material.
3. Expense amount is encrypted client-side and uploaded as base64 ciphertext.
4. Backend persists ciphertext and can sum ciphertext values homomorphically.
5. Browser decrypts returned/row ciphertext for UI rendering.

### Key handling model

- Secret key is wrapped (encrypted) client-side using a passphrase-derived key (PBKDF2 + AES-GCM).
- Backend stores wrapped key blob, not plaintext secret key.
- Passphrase is not recoverable by backend.

### CKKS details used currently

- Scheme: `CKKS`
- Poly modulus degree: `8192`
- Coeff mod bit sizes: `[60, 40, 40, 60]`
- Scale: `2^40`

CKKS is approximate arithmetic, which is ideal for numeric analytics like totals and category spending.

### Security assumptions and limitations

- If client/browser is compromised at runtime, displayed plaintext can be exposed.
- HE protects data at rest/in transit to server, not against malware on user device.
- Current app does not perform FX conversion; totals should be interpreted per selected currency.
- Timestamp/description/category are not HE-encrypted amounts and may still reveal metadata patterns.

### Operational note

The frontend includes robust local aggregation/decryption paths so dashboard totals/charts stay usable even if server-side aggregate ciphertext interop fails in specific runtime combinations.

## Key Features

- Client-side encryption for expense amounts (`node-seal` / WASM)
- FastAPI backend with encrypted expense storage
- Dashboard with decrypted total and category analytics (locally decrypted)
- Date filters: day, week, month, custom range
- Multi-currency support (default: `LKR`)
- Expense CRUD (add, edit, delete)
- Vault settings (key rotation, backup, default currency, CSV export)

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind, shadcn/ui, Recharts
- Backend: FastAPI, SQLAlchemy, SQLite, TenSEAL
- Containerization: Docker + Docker Compose

## Project Structure

```text
backend/    FastAPI app, DB models, schemas
frontend/   React app and UI components
```

## Run with Docker (Recommended)

From repository root:

```bash
docker compose up --build
```

App URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`

### Common Docker Commands

```bash
docker compose up -d
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

## Local Development

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Notes

- The frontend reads backend base URL from `frontend/.env` (`VITE_BACKEND_API_URL`) and defaults to `http://localhost:8000` if unset.
- For production-like static serving, Nginx SPA fallback is configured so routes like `/dashboard` and `/settings` work on refresh.
- `seal_throws.wasm` and related public assets are served from `frontend/public`.

## Troubleshooting

- If backend fails with missing modules, rebuild backend image:

```bash
docker compose build backend --no-cache
docker compose up -d backend
```

- If frontend shows stale assets, rebuild frontend and hard refresh browser (`Ctrl + F5`):

```bash
docker compose build frontend --no-cache
docker compose up -d frontend
```

