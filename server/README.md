# Church Inventory Reservation System — Backend

A Node.js + Express REST API for managing church item reservations. Uses Supabase (PostgreSQL) for the database and storage, bcrypt for password hashing, and JWT for authentication.

---

## Prerequisites

- Node.js v18+
- A Supabase project with the schema and RPC function deployed (see spec)

---

## Installation

```bash
cd server
npm install
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable              | Description                                      |
|-----------------------|--------------------------------------------------|
| `SUPABASE_URL`        | Your Supabase project URL                        |
| `SUPABASE_SERVICE_KEY`| Service role key (not the anon key)              |
| `JWT_SECRET`          | A long, random secret string for signing JWTs    |
| `PORT`                | Port to run the server on (default: `5000`)      |
| `GMAIL_USER`          | Gmail account used for notification emails       |
| `GMAIL_APP_PASSWORD`  | Gmail app password for notification emails       |
| `MAIL_FROM_NAME`      | Display name used in notification email senders  |

> ⚠️ Never commit `.env` to version control. The service role key bypasses all RLS policies.

---

## Running the Server

**Development** (auto-restarts on file changes):
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on `http://localhost:5000` (or your configured `PORT`).

## Vercel Deployment

The `api/index.js` adapter exports the Express app as a Vercel serverless function. Deploy from this directory so `vercel.json` and the server dependencies are used:

```bash
vercel login
vercel
vercel --prod
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `MAIL_FROM_NAME` in the Vercel project environment settings. `PORT` is only needed for local development.

---

## Project Structure

```
server/
├── api/
│   └── index.js                  # Vercel serverless function adapter
├── src/
│   ├── index.js                  # Entry point
│   ├── app.js                    # Express setup, middleware, route mounting
│   ├── config/
│   │   └── supabase.js           # Supabase client (service role)
│   ├── middleware/
│   │   ├── auth.js               # JWT verification → req.user
│   │   └── requireManager.js     # Role guard (manager only)
│   ├── routes/
│   │   ├── auth.js               # POST /api/auth/register, /login
│   │   ├── items.js              # GET/POST/PATCH /api/items
│   │   ├── requests.js           # GET/POST/PATCH /api/requests
│   │   ├── comments.js           # GET/POST /api/requests/:id/comments
│   │   └── conditionReports.js   # GET/POST /api/requests/:id/condition-reports
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── itemsController.js
│   │   ├── requestsController.js
│   │   ├── commentsController.js
│   │   └── conditionReportsController.js
│   └── utils/
│       └── storage.js            # Supabase Storage upload helper
├── .env.example
├── .gitignore
├── package.json
└── vercel.json
```

---

## API Reference

### Auth (public)
| Method | Route                  | Description                    |
|--------|------------------------|--------------------------------|
| POST   | `/api/auth/register`   | Register user (full_name, gmail, password, phone, role, gradegroup), returns JWT |
| POST   | `/api/auth/login`      | Login, returns JWT             |
| PUT    | `/api/auth/profile`    | Update full_name, gmail, phone, and gradegroup |

### Items (all require `Authorization: Bearer <token>`)
| Method | Route                              | Role    | Description                        |
|--------|------------------------------------|---------|------------------------------------|
| GET    | `/api/items`                       | Any     | List active items                  |
| GET    | `/api/items/availability`           | Any     | Check availability for all active items in a time window |
| GET    | `/api/items/:id/availability`      | Any     | Check availability for time window |
| GET    | `/api/items/:id/condition-history` | Manager | Full condition report history      |
| POST   | `/api/items`                       | Manager | Create item (multipart/form-data)  |
| PATCH  | `/api/items/:id`                   | Manager | Update item fields / photo         |
| PATCH  | `/api/items/:id/deactivate`        | Manager | Soft-delete item                   |
| PATCH  | `/api/items/:id/reactivate`        | Manager | Restore deactivated item           |

### Requests
| Method | Route                      | Role      | Description                             |
|--------|----------------------------|-----------|-----------------------------------------|
| POST   | `/api/requests`            | Any       | Submit request (calls Postgres RPC)     |
| GET    | `/api/requests/mine`       | Requester | My requests with items                  |
| PATCH  | `/api/requests/:id/cancel` | Requester | Cancel own request                      |
| GET    | `/api/requests`            | Manager   | All requests, optional `?status=` filter|
| PATCH  | `/api/requests/:id/status` | Manager   | Advance status (approved→prepared→completed) |

### Comments
| Method | Route                          | Role    | Description                            |
|--------|--------------------------------|---------|----------------------------------------|
| GET    | `/api/requests/:id/comments`   | Any     | Get all comments (oldest first)        |
| POST   | `/api/requests/:id/comments`   | Any     | Post a comment (requesters: own only)  |

### Condition Reports
| Method | Route                                  | Role    | Description                           |
|--------|----------------------------------------|---------|---------------------------------------|
| POST   | `/api/requests/:id/condition-reports`  | Manager | Submit reports (request must be completed) |
| GET    | `/api/requests/:id/condition-reports`  | Manager | Get reports for a request             |

---

## Authentication

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

JWT payload: `{ id, gmail, role }` — expires in **7 days**.

---

## Photo Uploads

Item photos are submitted as `multipart/form-data` with the field name `photo`.

- Max file size: **1 MB** (server-side guard)
- Frontend should compress images to < 300 KB before sending
- Files are never stored on the Express server — streamed directly to Supabase Storage bucket `item-photos`
- The returned `photo_url` is the full public URL stored in `items.photo_url`

---

## Error Response Shape

All errors follow the same format:

```json
{ "error": "Descriptive error message" }
```

| Status | Meaning                     |
|--------|-----------------------------|
| 400    | Bad input / validation error |
| 401    | Missing or invalid JWT       |
| 403    | Insufficient role            |
| 404    | Resource not found           |
| 409    | Conflict (e.g. items unavailable) |
| 500    | Internal server error        |

---

## Required Supabase Setup

### Tables
- `users`, `items`, `requests`, `request_items`, `item_condition_reports`, `request_comments`

### Storage Bucket
- Create a bucket named `item-photos` set to **public**

### RPC Function
Deploy the `create_request` PostgreSQL function (see spec for full SQL).
The function accepts:
- `p_requester_id` — UUID
- `p_start_time` — timestamp
- `p_end_time` — timestamp
- `p_notes` — text (nullable)
- `p_items` — JSON array of `{ item_id, quantity_requested }`

Returns: `{ success: boolean, request_id?: uuid, conflicts?: [...] }`
