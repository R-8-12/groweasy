# GrowEasy AI CSV Importer

A full-stack feature for **GrowEasy CRM** that lets users upload lead data in any CSV format and receive structured CRM records via AI-powered field extraction. The system handles arbitrary column naming conventions, processes rows in batches through an LLM, and streams real-time progress back to the browser.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Local Setup — Backend](#local-setup--backend)
4. [Local Setup — Frontend](#local-setup--frontend)
5. [Environment Variable Reference](#environment-variable-reference)
6. [Docker Compose Setup](#docker-compose-setup)
7. [Live Deployment URLs](#live-deployment-urls)
8. [API Reference](#api-reference)
9. [AI Prompt Strategy](#ai-prompt-strategy)
10. [Response Schema Reference](#response-schema-reference)

---

## Project Overview

The AI CSV Importer is composed of two services:

| Service | Technology | Default Port |
|---------|-----------|-------------|
| **Backend** | Node.js 20 + Express (TypeScript) | `4000` |
| **Frontend** | Next.js 14 (TypeScript + Tailwind CSS) | `3000` |

### How it works

1. **Upload** — The user drags and drops (or picks) a `.csv` file. The browser parses it client-side using PapaParse and shows a preview table.
2. **Preview** — All parsed rows are displayed before any backend call is made, giving the user a chance to verify the data.
3. **Processing** — On confirmation, the file is `POST`ed to `/api/import`. The backend splits the rows into batches of ≤ 50 and sends each batch to the OpenAI API. Progress is streamed back to the browser via Server-Sent Events (SSE).
4. **Results** — Imported CRM records and any skipped rows (no contact info, AI errors) are displayed in a virtualised, scrollable table.

The AI maps **arbitrary CSV columns** to **15 fixed CRM fields** so users never need to rename their export files.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 20.x LTS | Required for local development without Docker |
| **npm** | ≥ 10 (bundled with Node 20) | `pnpm` or `yarn` also work |
| **Docker** | 24+ | Required for the Docker Compose path |
| **Docker Compose** | v2 (plugin) | Included with Docker Desktop |
| **OpenAI API key** | — | See [Obtaining an API Key](#obtaining-an-api-key) |

### Obtaining an API Key

1. Sign in or create an account at <https://platform.openai.com>.
2. Go to **API keys** → **Create new secret key**.
3. Copy the key (it starts with `sk-`). You will not be able to view it again.
4. Set it as `OPENAI_API_KEY` in your `.env` file (see [Environment Variable Reference](#environment-variable-reference)).

---

## Local Setup — Backend

```bash
# 1. Enter the backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Create your environment file from the template
#    (repo root — see Environment Variable Reference below)
cp ../.env.example ../.env
# Edit .env and fill in OPENAI_API_KEY

# 4. Start the development server (TypeScript, hot-reload via ts-node)
OPENAI_API_KEY=sk-... FRONTEND_ORIGIN=http://localhost:3000 PORT=4000 npm run dev
```

The backend will be available at `http://localhost:4000`. Verify it is running:

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

To run the test suite:

```bash
npm test
# or with coverage
npm run test:coverage
```

---

## Local Setup — Frontend

Open a **second terminal** while the backend is running.

```bash
# 1. Enter the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the Next.js development server
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000 npm run dev
```

The frontend will be available at `http://localhost:3000`.

To run the test suite:

```bash
npm test
```

---

## Environment Variable Reference

Copy `.env.example` to `.env` at the repository root and fill in the values:

```bash
cp .env.example .env
```

| Variable | Consumed by | Required | Default | Description |
|----------|------------|----------|---------|-------------|
| `OPENAI_API_KEY` | Backend | **Yes** | — | Your OpenAI secret key (`sk-…`). Used to authenticate all LLM batch requests. |
| `PORT` | Backend | No | `4000` | Port the Express server listens on inside the container or local process. |
| `FRONTEND_ORIGIN` | Backend | No | `http://localhost:3000` | URL of the frontend as seen by browser clients. Set as `Access-Control-Allow-Origin` on every response. |
| `NEXT_PUBLIC_BACKEND_URL` | Frontend | No | `http://localhost:4000` | Base URL the frontend uses to call the backend API. Automatically set to `http://backend:4000` inside Docker Compose. |

> **Security note:** Never commit `.env` to source control. The `.env.example` file contains only placeholder values and is safe to commit.

---

## Docker Compose Setup

Docker Compose builds both images and wires their environment variables automatically.

### 1. Create your `.env` file

```bash
cp .env.example .env
# Open .env and set OPENAI_API_KEY=sk-<your-key>
```

### 2. Build and start both services

```bash
# From the repository root
docker compose up --build
```

Docker Compose will:

- Build the **backend** image using `backend/Dockerfile` (multi-stage: TypeScript compile → minimal Node 20 Alpine).
- Build the **frontend** image using `frontend/Dockerfile` (multi-stage: Next.js standalone output → minimal Node 20 Alpine).
- Start the backend first and wait for its health check (`GET /health`) to pass before starting the frontend.
- Expose the backend on `http://localhost:4000` and the frontend on `http://localhost:3000`.

### 3. Verify both services are up

```bash
# Backend health
curl http://localhost:4000/health
# {"status":"ok"}

# Frontend (should return HTML)
curl -I http://localhost:3000
# HTTP/1.1 200 OK
```

### 4. Stop the services

```bash
docker compose down
```

### Environment variables in Docker Compose

The `docker-compose.yml` reads `OPENAI_API_KEY` and `FRONTEND_ORIGIN` from your `.env` file at the repository root. The `NEXT_PUBLIC_BACKEND_URL` for the frontend is hard-coded to `http://backend:4000` (the Docker Compose service name) so the frontend container can reach the backend over the internal Docker network.

---

## Live Deployment URLs

The application is deployed on the following platforms:

| Service | Platform | URL |
|---------|----------|-----|
| **Frontend** | Vercel | `https://your-frontend.vercel.app` |
| **Backend API** | Railway | `https://your-backend.railway.app` |

> **Note:** Replace the placeholder URLs above with your actual deployment URLs after deploying. Update `FRONTEND_ORIGIN` on the backend deployment and `NEXT_PUBLIC_BACKEND_URL` on the frontend deployment to point at each other (see [Environment Variable Reference](#environment-variable-reference)).

Once deployed, verify end-to-end connectivity by importing a CSV file through the live frontend — a successful import response confirms CORS and networking are correctly configured.

---

## API Reference

### `POST /api/import`

Accepts a CSV file and streams progress + the final import result via Server-Sent Events.

| Attribute | Value |
|-----------|-------|
| URL | `/api/import` |
| Method | `POST` |
| Content-Type | `multipart/form-data` |
| File field name | `file` |
| Max file size | 50 MB |
| Response type | `text/event-stream` (SSE) |
| Timeout | 120 s |

#### Example: successful import

```bash
curl -N -X POST http://localhost:4000/api/import \
  -F "file=@leads.csv"
```

Response (streamed SSE):

```
data: {"type":"progress","batches_completed":1,"batches_total":2}

data: {"type":"progress","batches_completed":2,"batches_total":2}

data: {"type":"final","data":{"records":[...],"skipped":[],"total_imported":95,"total_skipped":0}}
```

#### Example: validation error (missing file field)

```bash
curl -X POST http://localhost:4000/api/import \
  -H "Content-Type: multipart/form-data"
```

Response (HTTP 422):

```json
{
  "error": "missing_file",
  "message": "No file was provided. Include a CSV file in the 'file' field of the multipart body."
}
```

### `GET /health`

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

---

## AI Prompt Strategy

The backend `aiService.ts` sends each batch of ≤ 50 CSV rows to the OpenAI API in a single request using **JSON mode** (`response_format: { type: "json_object" }`). The model is instructed to return a JSON array of exactly `N` CRM records — one per input row, in the same order.

### System prompt (11 rules)

```
You are a CRM data extraction assistant. Your task is to map arbitrary CSV lead data
to a fixed set of CRM fields. You will receive CSV rows and must return a JSON array
of exactly the same length, where each element is a CRM record for the corresponding row.

RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no extra text.
2. Return exactly one CRM record per input row, in the same order.
3. Every CRM record must contain all 15 fields even if the value is an empty string.
4. crm_status must be exactly one of: GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE.
   If no status can be inferred, use DID_NOT_CONNECT.
5. data_source must be exactly one of: leads_on_demand, meridian_tower, eden_park,
   varah_swamy, sarjapur_plots. If no source can be inferred, use an empty string "".
6. created_at must be an ISO 8601 date-time string (e.g. "2024-01-15T00:00:00.000Z")
   if an unambiguous date is present; otherwise use "".
7. If a row contains multiple email addresses, put the first in "email" and append
   the rest to "crm_note" as: additional_emails: addr1, addr2
8. If a row contains multiple mobile numbers, put the first (without country code)
   in "mobile_without_country_code" and append the rest to "crm_note" as:
   additional_mobiles: num1, num2
9. Escape all newlines within field values as the two-character sequence \n.
10. If a row has NO valid email and NO valid mobile number, set the special field
    "__skip__" to true in that record. All other fields may be empty strings.
11. Use "crm_note" to store any remarks, follow-up notes, or data that does not fit
    the other 14 fields.
```

### User prompt template

```
Process the following {{N}} CSV rows and return a JSON array of {{N}} CRM records.

CSV Column Headers: {{headers}}

Rows (JSON array of objects):
{{rows_json}}
```

Where:
- `{{N}}` is the number of rows in the current batch (≤ 50).
- `{{headers}}` is the comma-separated list of CSV column names.
- `{{rows_json}}` is the batch serialised as a JSON array of objects.

### Response parsing and guardrails

After the LLM responds, `aiService.ts` applies the following safety net:

| Condition | Action |
|-----------|--------|
| Fewer records returned than input rows | Remaining rows marked `ai_batch_failed` |
| `crm_status` not in valid enum | Coerced to `DID_NOT_CONNECT` |
| `data_source` not in valid enum | Coerced to `""` |
| `created_at` not parseable by `new Date()` | Set to `""` |
| Record has `__skip__: true` | Moved to `skipped` with reason `no_contact_info` |
| Any of the 15 fields missing | Defaulted to `""` |

### Retry strategy

Failed LLM calls are retried up to **4 total attempts** with exponential back-off:

| Attempt | Delay before attempt |
|---------|---------------------|
| 1 | 0 ms (immediate) |
| 2 | 1 000 ms |
| 3 | 2 000 ms |
| 4 | 4 000 ms |

Non-transient errors (HTTP 400, 401, 403, 404) are **not retried**. Transient errors (HTTP 429, 500–504, network timeout > 30 s) trigger the retry schedule above.

---

## Response Schema Reference

A successful `POST /api/import` stream ends with a `final` SSE event whose `data` field contains:

```json
{
  "records": [
    {
      "created_at": "2024-01-15T00:00:00.000Z",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "country_code": "+91",
      "mobile_without_country_code": "9876543210",
      "company": "Acme Corp",
      "city": "Bengaluru",
      "state": "Karnataka",
      "country": "India",
      "lead_owner": "",
      "crm_status": "GOOD_LEAD_FOLLOW_UP",
      "crm_note": "",
      "data_source": "leads_on_demand",
      "possession_time": "",
      "description": ""
    }
  ],
  "skipped": [
    {
      "row_index": 4,
      "reason": "no_contact_info"
    }
  ],
  "total_imported": 1,
  "total_skipped": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `records` | `CrmRecord[]` | Successfully extracted CRM records, one per valid input row. |
| `skipped` | `SkippedRecord[]` | Rows that could not be imported. |
| `total_imported` | `number` | Always equals `records.length`. |
| `total_skipped` | `number` | Always equals `skipped.length`. `total_imported + total_skipped` equals the total CSV row count. |
| `skipped[].row_index` | `number` | 0-based index of the skipped row in the original CSV (data rows only, header excluded). |
| `skipped[].reason` | `string` | One of: `no_contact_info` (row had no email or mobile), `ai_batch_failed` (non-transient AI error or all retries exhausted), `ai_service_unavailable` (all retries exhausted for a transient error). |

### CRM field definitions

| Field | Type | Notes |
|-------|------|-------|
| `created_at` | `string` | ISO 8601 date-time or `""` |
| `name` | `string` | Lead full name |
| `email` | `string` | First email address found; extras go to `crm_note` |
| `country_code` | `string` | e.g. `"+91"` |
| `mobile_without_country_code` | `string` | First mobile without country code; extras go to `crm_note` |
| `company` | `string` | |
| `city` | `string` | |
| `state` | `string` | |
| `country` | `string` | |
| `lead_owner` | `string` | |
| `crm_status` | `enum` | `GOOD_LEAD_FOLLOW_UP` \| `DID_NOT_CONNECT` \| `BAD_LEAD` \| `SALE_DONE` |
| `crm_note` | `string` | Free-text remarks, overflow emails/mobiles, follow-up notes |
| `data_source` | `enum \| ""` | `leads_on_demand` \| `meridian_tower` \| `eden_park` \| `varah_swamy` \| `sarjapur_plots` \| `""` |
| `possession_time` | `string` | |
| `description` | `string` | |
