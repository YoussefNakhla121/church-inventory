# Church Inventory Reservation System — Project Spec
> Version 2.0

## Overview

A web application for a church to manage the reservation of physical items (chairs, projectors, etc.).
Church members (requesters) can browse available items and submit time-based reservation requests.
Inventory managers review and physically prepare approved requests.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | Custom (bcrypt + JWT in Express) |
| File Storage | Supabase Storage (item photos) |

---

## User Roles

### Requester
- A church member who needs items for an event.
- Can browse items (with photos), check availability, and submit requests.
- Can track the status of their own requests.
- Can cancel their own requests (frees up items for others).
- Can leave comments on their own requests.

### Manager
- A church member who manages the inventory.
- Can see all incoming approved requests.
- Physically prepares items and marks requests as "Prepared" or "Completed".
- Can flag items as damaged after a request is completed.
- Can leave comments on any request.

### Shared Fields (both roles)
- `gmail` (unique)
- `password` (hashed with bcrypt)
- `phone number` (for direct communication between requesters and managers)
- `role` (requester | manager)

> **Auth approach:** Custom users table in Supabase + bcrypt password hashing + JWT tokens issued by Express. No Supabase Auth (avoids the email requirement hack).

---

## Business Rules

### Reservations & Time
- Requests are time-window based: every request has a **start time** and **end time**.
- Requesters can book up to **3 months (90 days)** in advance.
- The backend validates the 90-day rule — not just the frontend date picker.
- An item is considered **unavailable** for a time window if:
  `quantity already reserved in overlapping windows >= item's total quantity`

### Auto-Approval
- When a request is submitted, the system **immediately checks availability**.
- If all requested items are available → request status = **Approved** automatically.
- If any item is unavailable → request status = **Rejected**.
- On rejection, the response includes **per-item conflict details**:
  - Which specific item(s) caused the rejection.
  - How many units of that item are available in the requested window.
  - How many were requested vs. how many exist in total.
- There is no manual approval step — managers only handle physical preparation.

### Cancellation
- A requester can cancel their own request **at any time before Prepared**.
- Cancellation **releases the reserved quantities** back into the available pool for that time window.
- Status on cancellation → **Cancelled**.

### Item Soft Delete
- Items are never permanently deleted from the database.
- Managers can mark an item as **inactive** (retired/removed from inventory).
- Inactive items do not appear in the item browser for new requests.
- All existing requests and history that reference the item remain intact.

### Item Condition Tracking
- After a request is marked **Completed**, managers can log a condition report for any item in that request.
- Condition options: `good` | `damaged` | `missing`.
- Each report has an optional notes field (e.g. "leg is cracked", "cable missing").
- Damage reports build a **maintenance history per item**, visible to managers.
- This explains why effective available quantities may drop over time.

### No Notifications
- No email or SMS notifications.
- Users track their request status and comments directly in the web app.

---

## Data Model

### `users`
```
id              uuid, primary key
full_name       text, not null
gmail           text, unique, not null
password_hash   text, not null
phone           text, not null
role            enum('requester', 'manager'), not null
created_at      timestamp
```

### `items`
```
id              uuid, primary key
name            text, not null
description     text
total_quantity  integer, not null (>= 1)
category        text (optional, e.g. "Furniture", "Electronics")
photo_url       text (nullable — points to Supabase Storage)
is_active       boolean, not null, default true
created_at      timestamp
```

> Soft delete is handled by `is_active = false`. Queries for the item browser filter `WHERE is_active = true`.

### `requests`
```
id               uuid, primary key
requester_id     uuid, foreign key → users.id
start_time       timestamp, not null
end_time         timestamp, not null
notes            text
status           enum('approved', 'rejected', 'prepared', 'completed', 'cancelled'), not null
rejection_reason text (nullable — plain text summary)
rejection_detail jsonb (nullable — per-item conflict breakdown, see below)
created_at       timestamp
```

#### `rejection_detail` JSON shape
```json
{
  "conflicts": [
    {
      "item_id": "uuid",
      "item_name": "Projector",
      "requested": 2,
      "total_quantity": 3,
      "available_in_window": 1
    }
  ]
}
```

### `request_items`
```
id                  uuid, primary key
request_id          uuid, foreign key → requests.id
item_id             uuid, foreign key → items.id
quantity_requested  integer, not null (>= 1)
```

### `item_condition_reports`
```
id            uuid, primary key
request_id    uuid, foreign key → requests.id
item_id       uuid, foreign key → items.id
reported_by   uuid, foreign key → users.id (must be a manager)
condition     enum('good', 'damaged', 'missing'), not null
notes         text (nullable)
reported_at   timestamp
```

> One report per item per completed request. Managers can submit reports only after the request reaches `completed` status.

### `request_comments`
```
id          uuid, primary key
request_id  uuid, foreign key → requests.id
author_id   uuid, foreign key → users.id
body        text, not null
created_at  timestamp
```

> Any participant can comment: the requester who owns the request, or any manager.
> Comments are ordered by `created_at` ascending (oldest first).
> No editing or deleting comments — keeps a clean audit trail.

---

## Request Status Flow

```
[Requester submits]
        |
        v
[System checks availability]
        |
   +---------+-----------+
   |                     |
items available     items unavailable
   |                     |
   v                     v
APPROVED            REJECTED
(with per-item      (with per-item
 conflict detail     conflict detail
  = null)            populated)
   |
Manager sees it
   |
   v
PREPARED   ← managers can comment here
(items are physically ready)
   |
   v
COMPLETED
   |
   v
[Manager submits condition reports per item]

At any point before PREPARED:
CANCELLED  (by requester — releases reserved quantities)
```

---

## Availability Check & Race Condition Handling

### The Problem
Two requesters could submit for the last available item at the exact same millisecond, both
passing the availability check before either one writes to the database.

### The Solution: Postgres Transaction with Row Lock (Supabase RPC)
Availability check + insertion happen inside a single **PostgreSQL function** (called via `supabase.rpc()`).
The function uses `SELECT ... FOR UPDATE` to lock the relevant rows during the transaction,
so concurrent requests are queued — not duplicated.

The RPC function also builds the `rejection_detail` JSON so the backend
receives a structured conflict report without doing a second query.

```sql
-- Pseudocode for the Postgres RPC function
CREATE OR REPLACE FUNCTION create_request(...)
RETURNS json AS $$
DECLARE
  conflicts jsonb := '[]';
BEGIN
  -- Lock relevant item rows
  SELECT id FROM items WHERE id = ANY(item_ids) FOR UPDATE;

  -- Check availability for each item in the time window
  FOR each item IN requested_items LOOP
    reserved := (
      SELECT COALESCE(SUM(ri.quantity_requested), 0)
      FROM request_items ri
      JOIN requests r ON r.id = ri.request_id
      WHERE ri.item_id = item.id
        AND r.status IN ('approved', 'prepared')
        AND r.start_time < input_end_time
        AND r.end_time > input_start_time
    );

    IF reserved + item.quantity_requested > item.total_quantity THEN
      conflicts := conflicts || jsonb_build_object(
        'item_id',             item.id,
        'item_name',           item.name,
        'requested',           item.quantity_requested,
        'total_quantity',      item.total_quantity,
        'available_in_window', item.total_quantity - reserved
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(conflicts) > 0 THEN
    INSERT INTO requests (status, rejection_reason, rejection_detail, ...)
      VALUES ('rejected', 'Some items are unavailable', jsonb_build_object('conflicts', conflicts), ...);
    RETURN json_build_object('success', false, 'conflicts', conflicts);
  END IF;

  -- All items available — insert request and request_items
  INSERT INTO requests (status, ...) VALUES ('approved', ...);
  INSERT INTO request_items (...) VALUES (...);

  RETURN json_build_object('success', true, 'request_id', new_request_id);
END;
$$ LANGUAGE plpgsql;
```

The Express backend calls this as:
```javascript
const { data, error } = await supabase.rpc('create_request', { ...payload });
```

---

## API Endpoints (Express)

### Auth
```
POST   /api/auth/register          Create a new user (full_name, gmail, password, phone, role)
POST   /api/auth/login             Returns JWT token
PUT    /api/auth/profile           Update full_name, gmail, phone, and gradegroup
```

### Items
```
GET    /api/items                              List active items (is_active = true)
GET    /api/items/:id/availability             Available quantity for a time window
                                               ?start=...&end=...
GET    /api/items/:id/condition-history        Manager only: condition reports for an item
POST   /api/items                             Manager only: create item (with optional photo upload)
PATCH  /api/items/:id                         Manager only: edit name/description/quantity/category
PATCH  /api/items/:id/deactivate              Manager only: soft delete (is_active = false)
PATCH  /api/items/:id/reactivate              Manager only: restore a deactivated item
```

### Requests
```
POST   /api/requests                           Submit a new request (calls Postgres RPC)
GET    /api/requests/mine                      Requester: their own requests + status + conflict detail
PATCH  /api/requests/:id/cancel               Requester: cancel their own request
GET    /api/requests                           Manager only: all requests (filterable by status/date)
PATCH  /api/requests/:id/status               Manager only: move status (prepared → completed)
```

### Comments
```
GET    /api/requests/:id/comments              All users: read comments on a request
POST   /api/requests/:id/comments             All users: post a comment on a request
```

### Condition Reports
```
POST   /api/requests/:id/condition-reports    Manager only: submit condition report after completion
GET    /api/requests/:id/condition-reports    Manager only: view condition reports for a request
```

---

## Frontend Pages (React)

### Shared
- Login page
- Register page

### Requester Views
- **Item browser** — grid of active items with photo, name, category, total quantity
  - Time window picker to check real-time availability before selecting
- **New request form** — select items + quantities, pick start/end datetime, add notes
- **My requests list** — status badge per request, cancel button, link to detail
- **Request detail** — full info, conflict detail if rejected, comment thread

### Manager Views
- **Requests dashboard** — filterable by status (approved / prepared / completed / cancelled)
  - Shows requester name + phone number for quick contact
- **Request detail** — items list, requester info, notes, comment thread, status action buttons
- **Condition report form** — appears after marking a request as Completed; one row per item
- **Item management page** — add/edit items, upload photos, deactivate/reactivate
- **Item condition history** — per-item log of all condition reports across all requests

---

## Supabase Storage (Photos)

- Bucket: `item-photos`, set to **public** (so photo URLs work without auth).
- `items.photo_url` stores the uploaded filename; API responses expand it to the full public URL.
- On item deactivation, photo is kept (item may be reactivated later).

### Upload Flow
```
Manager picks a photo (file input in React)
    → browser-image-compression resizes/compresses it (< 300 KB)
        → POST /api/items (multipart/form-data, via multer in Express)
            → Express uploads to Supabase Storage
                → Supabase returns the stored filename
                    → Filename saved to items.photo_url in the database
```

Photos are never stored on the Express server — it receives the file and immediately forwards it to Supabase Storage.

### Frontend Compression (before upload)
Use the `browser-image-compression` npm package to compress the image in the browser before it is sent to the backend.

```javascript
import imageCompression from 'browser-image-compression';

const options = {
  maxSizeMB: 0.3,        // 300 KB hard cap
  maxWidthOrHeight: 800, // resize large photos down
  useWebWorker: true,    // non-blocking
};

const compressedFile = await imageCompression(originalFile, options);
// then append compressedFile to FormData and POST to Express
```

This keeps every photo well under 300 KB regardless of what the manager uploads (even a 10 MB camera photo becomes a small compressed version automatically).

### Backend File Size Guard (Express + multer)
As a second line of defence, limit the file size accepted by the Express route:

```javascript
const upload = multer({
  limits: { fileSize: 1 * 1024 * 1024 } // 1 MB max (after compression this should never trigger)
});
```

### Supabase Free Tier
| Resource | Free Limit | Expected Usage |
|---|---|---|
| Storage | 1 GB | ~10–25 MB for 50 items at 200–500 KB each |
| Transfer | 2 GB / month | Very low for a church-sized app |

The free tier is more than sufficient for this app.

---

## Open Questions for Later

- **Who can register as a manager?** Should manager accounts be created only by other managers, or is there an open registration with a role selector?
- **Partial requests:** If a request has 3 items and only 1 is unavailable, reject the whole request or let the requester adjust quantities and retry?
- **Request editing:** Can a requester edit an approved request (e.g. change the time), or must they cancel and re-submit?
- **Quantity adjustment from damage:** If an item is repeatedly reported as damaged/missing, should the system suggest reducing `total_quantity`? Or should managers update it manually?
