# Admin Role & Payments: Implementation Plan

Church Inventory app (React + Express + Supabase on Vercel).

## How to use this file

- **DB steps**: SQL you run yourself in the Supabase SQL editor, one block at a time, in order.
- **Code steps**: a prompt for your AI agent. One step = one prompt = one commit/PR. Don't batch them.
- Save this file in the repo as `docs/admin-payments-plan.md`. Every prompt tells the agent to read the **Decisions** and **Shared context** sections first, so the prompts stay short and the API contract stays consistent between server and client steps.
- Do the steps in order. After every code step the agent must run `npm test` (server) and `npm run lint && npm run build` (client) and report the result.

| # | Type | Step | Depends on |
|---|------|------|-----------|
| 0 | DB | Inspect the current database (read-only) | **done** |
| 1 | DB | Allow the `admin` role | **done** (enum already has `admin`) |
| 2 | Code (server) | Create-admin endpoint + gradegroup validation | 1 |
| 3 | Code (client) | Role select on the create-account page | 2 |
| 4 | Code (server) | Role hardening: admin gets no requester access, admin gradegroup locked | 2 |
| 5 | Code (client) | Admin shell: route guard, navbar, login redirect, profile | 3, 4 |
| 6 | DB | ~~Data hygiene~~ **skipped**, not needed (see below) | none |
| 7 | DB | `payments` + `payment_requests` tables, indexes, RLS | 1 |
| 8 | DB | Scope helper + read functions (summary, list) | 7 |
| 9 | DB | Write functions (request / decide / cancel payment), status-lock trigger, grants | 8 |
| 10 | Code (server) | Admin endpoints | 5, 9 |
| 11 | Code (client) | Admin payments page | 10 |
| 12 | Code (server) | Manager payments endpoints | 9 |
| 13 | Code (client) | Manager payments pages + navbar badge | 12 |
| 14 | Code (server) | Emails (managers on request, admin on decision) | 10, 12 |
| 15 | Both | End-to-end verification + docs | all |
| 16 | Optional | Admin can cancel a pending payment | 13 |

---

## Decisions (assumptions; change them before starting if any is wrong)

- **D1, What "pay" means.** No payment gateway. The admin declares "we paid" (cash or transfer) and a manager confirms they received it. Accepting sets `requests.paid = true`.
- **D2, Payable requests.** A request is payable only if `status = 'completed'`, `end_time <= now()`, `paid = false` and it is not already linked to a payment. Cancelled and rejected requests are never payable.
- **D3, Period filter.** The period is two calendar dates (start and end, both inclusive) in **Africa/Cairo** time. A request belongs to the period by the Cairo date of its `start_time`.
- **D4, Grade groups.** An admin's `gradegroup` is one of the `gradegroup` table names or `ابتدائي`. `ابتدائي` expands to `اول وتاني`, `تلاتة ورابعة` and `خامسة وسادسة`. One Pay click pays everything in the admin's scope; the review screen shows a per-subgroup breakdown. `ابتدائي` is never inserted into the `gradegroup` table (requesters would see it in Register).
- **D5, Notifications.** The pending `payments` rows are the notifications: managers get a Payments page with a navbar badge, plus an email with a link into the app. There are no accept/decline links inside emails.
- **D6, Decision.** Any manager can accept or decline. The first decision wins; a second manager gets "already decided". Decline has an optional note. The admin is emailed the result.
- **D7, What admins can see/do.** Admins only get their own payments page and their profile. They cannot create requests, browse items, or read comments. They see requester name, items, window, status, total price and paid state, but no phone numbers.
- **D8, Money safety.** A payment is blocked if any payable request in the period has a null `total_price`. Requests linked to a pending or approved payment cannot change status.
- **D9, Currency.** EGP everywhere (the `$` in `ItemCard` gets fixed in step 11).

---

## Shared context (for the AI agent)

### Stack and conventions
- `client/`: React 19 + Vite, React Router, Axios (`src/api/*.js`), CSS Modules with the design tokens in `src/index.css`. Follow existing pages (for example `pages/manager/Dashboard.jsx` and its `.module.css`) for layout, loading, error and mobile behavior.
- `server/`: Express 4, Supabase JS (service-role key), JWT payload `{ id, gmail, role }`, middleware `auth` then `requireManager`/`requireRole`. Errors are always `{ error: '...' }` and may include `code`.
- Atomic or multi-row money logic lives in Postgres RPCs called with `supabase.rpc(...)`, like `create_request`. Express only validates input, calls the RPC and maps result codes to HTTP statuses.
- Tests: Vitest + supertest in `server/src/tests/`, using `fakeQuery`/`mockTables` from `supabaseMock.js` and `authHeader(role)` from `helpers.js`. Existing tests must keep passing.
- Emails use `server/src/utils/emails.js` and are sent after the response with `runInBackground`.
- Prices and totals are whole-number EGP integers (`items.price`, `requests.total_price`, `payments.total_price`).
- Never read a role or gradegroup from `req.body` to make an authorization decision. Admin gradegroup is always loaded from the DB inside the RPC.
- Arabic text: set `dir="auto"` on elements that display gradegroup names.

### Roles

| Capability | requester | manager | admin |
|---|---|---|---|
| Browse items, create/cancel requests, my requests, comments | yes | yes | **no** |
| Manager dashboard, items management, condition reports | no | yes | no |
| Create manager/admin accounts | no | yes | no |
| Admin payments page (`/admin`) | no | no | yes |
| Review/decide payments (`/manager/payments`) | no | yes | no |
| Change own gradegroup | yes | n/a | **no** |

### Payment lifecycle
1. Admin picks a period and clicks Pay. The RPC `request_payment` locks the payable requests, creates a `payments` row with status `pending` and one `payment_requests` row per included request (`active = true`).
2. Any manager reviews it. `decide_payment` with `approved` sets `payments.status='approved'` and `requests.paid=true` (the junction rows stay active, so those requests are locked for good). With `declined` it sets `status='declined'` and turns the junction rows to `active = false`, so the requests become payable again while the declined payment keeps its history.
3. The database guarantees a request can belong to only ONE active payment (partial unique index on `payment_requests`), so double payment is impossible even if the code has a bug.
3. Optional: the admin can cancel a pending payment (step 16).

### Dates
The client sends plain `YYYY-MM-DD` strings. Validate them on the server (real calendar date, `start <= end`, span at most 366 days) and pass the strings straight to the RPC. Never convert them with JS `Date` objects.

### API contract (server and client steps must match this exactly)

**Admin** (requires role `admin`)
- `GET /api/admin/summary?start=YYYY-MM-DD&end=YYYY-MM-DD` returns
  `{ gradegroup, scope: string[], payable_count, payable_total, missing_price_count, pending_count, pending_total, paid_count, paid_total, by_group: [{ gradegroup, request_count, total }] }`
  (`by_group` is the breakdown of the *payable* requests).
- `GET /api/admin/requests?start&end&page&pageSize` returns
  `{ data: [{ id, start_time, end_time, status, gradegroup, total_price, paid, payment_id, payment_status, requester_name, payable, items: [{ name, quantity }] }], total, page, pageSize }`
- `POST /api/admin/payments` with `{ start, end }` returns `201 { payment }` where payment is `{ id, gradegroup, period_start, period_end, total_price, request_count, status, created_at }`.
  Errors: `400 invalid_period`, `403 not_admin`, `409` with `code` in `nothing_payable | missing_prices | zero_total` (`missing_prices` also returns `missing_count`).
- `GET /api/admin/payments?page&pageSize` returns the admin's own payments `{ data: [payment], total, page, pageSize }`, newest first.

**Manager** (requires role `manager`)
- `GET /api/payments?status=pending|approved|declined|cancelled&page&pageSize` returns `{ data: [{ ...payment, requested_by_name }], total, page, pageSize }`, newest first. No `status` means all.
- `GET /api/payments/pending-count` returns `{ count }`.
- `GET /api/payments/:id` returns `{ payment: { ...payment, requested_by_name, decided_by_name }, requests: [{ id, start_time, end_time, gradegroup, total_price, requester_name, items: [{ name, quantity }] }] }`.
- `PATCH /api/payments/:id/decision` with `{ decision: 'approved' | 'declined', note? }` returns `200 { payment }`. Errors: `404 not_found`, `409 already_decided`, `400 invalid_decision`.
- Route order: `/pending-count` must be registered before `/:id`.

---

# PHASE A: Admin role foundation

## Step 0, DB: inspect the current database (read-only)

Run each query and send me the results. The next steps depend on the answers.

```sql
-- 0.1 Column types (is start_time timestamptz or timestamp? is paid there?)
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('requests', 'users', 'items', 'request_items', 'gradegroup')
  and column_name in ('start_time','end_time','created_at','total_price','price',
                      'gradegroup','role','paid','name')
order by table_name, column_name;

-- 0.2 How users.role is constrained (enum type name or CHECK constraint)
select t.typname, t.typtype
from pg_attribute a join pg_type t on t.oid = a.atttypid
where a.attrelid = 'public.users'::regclass and a.attname = 'role';

select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.users'::regclass;

-- 0.3 The real gradegroup names (needed for the 'ابتدائي' mapping in step 8)
select name from public.gradegroup order by name;

-- 0.4 Current RPC definitions (paste them to me)
select proname, pg_get_functiondef(oid) as definition
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('create_request', 'change_request_status');

-- 0.5 Data health
select
  count(*)                                                         as total_requests,
  count(*) filter (where gradegroup is null or btrim(gradegroup) = '') as null_gradegroup,
  count(*) filter (where status = 'completed' and total_price is null) as completed_null_price,
  count(*) filter (where paid)                                     as already_paid
from public.requests;
```

**Results (recorded):**
- `requests.start_time` / `end_time` are `timestamptz`, so the Cairo-time SQL in step 8 works as written.
- `items.price` and `requests.total_price` are **integers** (whole EGP). `requests.paid` is nullable (step 7.1 fixes that).
- `users.role` is an enum and `admin` was already added.
- Gradegroup names match the `ابتدائي` mapping exactly: `اول وتاني`, `تلاتة ورابعة`, `خامسة وسادسة`. `ابتدائي` is not added to the table.
- Data: 3 requests, 0 with a null gradegroup, 0 completed requests with a null price, 0 paid.
- `create_request` (6-argument version) already stores `COALESCE(p_gradegroup, user's gradegroup)` on every request, including rejected ones, and `change_request_status` updates status through `EXECUTE format(...)`. Both work with the step 9 status-lock trigger.
- Still unchecked: whether `users.gradegroup` has a foreign key to `gradegroup(name)`. Check with
  `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.users'::regclass and contype = 'f';`
  If it returns a foreign key on `gradegroup`, creating an `ابتدائي` admin will fail and we need to decide how to handle it.

## Step 1, DB: allow the `admin` role

**Done:** `users.role` is an enum and `admin` has already been added. Nothing to run.

<details><summary>Original SQL options (not needed anymore)</summary>

Run **one** of the two options, depending on what 0.2 showed.

```sql
-- Option A: users.role is a Postgres ENUM (replace user_role with the typname from 0.2)
-- Run this statement alone, not inside a bigger transaction.
alter type public.user_role add value if not exists 'admin';
```

```sql
-- Option B: users.role is text with a CHECK constraint
-- (replace users_role_check with the conname from 0.2)
alter table public.users drop constraint users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('requester', 'manager', 'admin'));
```

If 0.2 showed a foreign key from `users.gradegroup` to the `gradegroup` table, stop and tell me: `ابتدائي` would be rejected and we need to decide how to handle it.

</details>

## Step 2, Code (server): create-admin endpoint

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first. Do ONLY this step.

Goal: managers can create admin accounts through the API. (Role hardening is step 4, not here.)

1. Create server/src/utils/gradeGroups.js exporting:
   - ADMIN_EXTRA_GRADE_GROUPS = ['ابتدائي']
   - getGradeGroupNames(): returns the trimmed, non-empty names from the `gradegroup` table, using cacheGet/cacheSet with KEYS.GRADEGROUPS and TTL.GRADEGROUPS (fail-open exactly like the current route).
2. Refactor server/src/routes/gradeGroups.js to use getGradeGroupNames() with an identical response and X-Cache header. 'ابتدائي' must NOT appear in this public endpoint or in its Redis cache.
3. authController.js: keep createUser as the shared implementation. Add `registerAdmin = (req, res) => createUser(req, res, 'admin')` and export it. In createUser, ONLY when role === 'admin': trim gradegroup and return 400 { error: 'gradegroup must be one of the available grade groups' } unless it is in [...await getGradeGroupNames(), ...ADMIN_EXTRA_GRADE_GROUPS]. Requester and manager behavior must not change.
4. server/src/routes/auth.js: add POST /api/auth/register-admin protected by `auth` then `requireManager`, handled by registerAdmin. The role comes from the route and is never read from req.body. Leave /register and /register-manager unchanged.
5. Tests (follow existing style in server/src/tests):
   - register-admin: 401 without token, 403 with requester token, 403 with admin token, 401 with a wrong-secret token.
   - manager token + missing gradegroup -> 400; manager token + unknown gradegroup -> 400.
   - manager token + a name from the gradegroup table -> 201 and the inserted row has role 'admin' and a bcrypt hash.
   - manager token + 'ابتدائي' -> 201.
   - public POST /api/auth/register with role:'admin' in the body still creates a 'requester'.
   - GET /api/gradegroups does not contain 'ابتدائي'.

Do not touch other routes. Run `npm test` in server/. Final answer: files changed and test results.
````

## Step 3, Code (client): role select on the create-account page

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first. Do ONLY this step. Step 2 is already done (POST /api/auth/register-admin exists).

Files: client/src/api/auth.js, client/src/pages/manager/CreateManagerAccount.jsx (route /manager/create-account, already behind ManagerRoute), new client/src/constants/gradeGroups.js.

1. api/auth.js: add `export const registerAdmin = (data) => api.post('/api/auth/register-admin', data);`
2. Create client/src/constants/gradeGroups.js exporting ADMIN_EXTRA_GRADE_GROUPS = ['ابتدائي'].
3. CreateManagerAccount.jsx:
   - Add a "Role" select as a new inputGroup (reuse styles.select from Login.module.css) with options Manager (value 'manager', default) and Admin (value 'admin').
   - Add `role` and `gradegroup` state. Fetch grade groups with getGradeGroups() (same pattern as Register.jsx).
   - The "Grade Group" select is rendered ONLY when role === 'admin'. Options = fetched groups + ADMIN_EXTRA_GRADE_GROUPS without duplicates. It is required, with a placeholder option ("Select Grade Group", or "Loading grade groups..." and disabled while loading).
   - Switching back to 'manager' hides the select and resets gradegroup to ''.
   - Submit: manager -> registerManager({ full_name, gmail, password, phone, role:'manager', gradegroup:'N/A' }) exactly as today. Admin -> registerAdmin({ full_name, gmail, password, phone, gradegroup }). Block submit if admin and no gradegroup.
   - Make titles, button text and success message role-aware ("Create Account", "Manager account created successfully!" / "Admin account created successfully!"). After success clear every field including gradegroup and keep the existing 2s redirect to /manager.
   - Add dir="auto" on the select so Arabic options render correctly.

Do not change any other page. Run `npm run lint && npm run build` in client/. Final answer: files changed.
````

## Step 4, Code (server): role hardening

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first. Do ONLY this step.

Goal: deny-by-default roles. An admin must NOT get any requester access (see the role table in "Shared context").

1. Create server/src/middleware/requireRole.js exporting requireRole(...roles): 403 { error: 'Access denied' } when req.user.role is not in roles. Keep requireManager working with its exact message 'Access denied: managers only' (existing tests assert it).
2. After `auth`, add requireRole('requester', 'manager') to: POST /api/requests, GET /api/requests/mine, PATCH /api/requests/:id/cancel, GET /api/requests/:id, GET and POST /api/requests/:id/comments, GET /api/items, GET /api/items/availability, GET /api/items/:id/availability. Order must stay auth -> role -> handler so unauthenticated requests still get 401.
3. Replace fragile `role === 'requester'` checks so any role other than manager is treated as non-manager: commentsController (getComments and postComment ownership checks) and itemsController.getItems (price stripping). Grep the whole server/src for other `role ===` checks and fix them the same way. List every place you changed.
4. authController.updateProfile: when req.user.role === 'admin', load the admin's current gradegroup from the DB (extend the existing select to 'gmail, gradegroup', and only branch on it for admins so existing tests keep passing). If the trimmed body gradegroup differs from the stored one, return 403 { error: 'Admins cannot change their grade group' }. Other roles unchanged.
5. Tests:
   - For each route in item 2: admin token -> 403 { error: 'Access denied' }; requester and manager tokens still pass the role gate.
   - Admin token on manager-only routes -> 403 (add 'post /api/auth/register-admin' and 'post /api/auth/register-manager' to MANAGER_ROUTES in roles.test.js if missing).
   - Comments: a requester still cannot read or post on another user's request.
   - GET /api/items as manager includes price, as requester does not.
   - updateProfile: admin changing gradegroup -> 403; admin keeping the same gradegroup -> 200; requester changing gradegroup -> 200.

Run `npm test` in server/. Final answer: files changed, every role check modified, test results.
````

## Step 5, Code (client): admin shell

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first. Do ONLY this step. Steps 3 and 4 are done.

Goal: an admin can log in, lands on /admin (placeholder page for now), and cannot reach requester pages.

1. Create client/src/components/RoleRoute.jsx: props { allow: string[], children }. Not authenticated -> <Navigate to="/login" state={{from: location}} replace />. Role not in allow -> redirect to the role's home: admin -> '/admin', manager -> '/manager', requester -> '/'. Be careful not to create redirect loops.
2. App.jsx: wrap /, /requests, /requests/new, /requests/:id in <RoleRoute allow={['requester','manager']}> (replacing ProtectedRoute there). Add /admin inside <RoleRoute allow={['admin']}> rendering a new placeholder page client/src/pages/admin/AdminPayments.jsx (title "Payments", empty state text; it is built in step 11). Keep /profile/edit on ProtectedRoute. Keep ManagerRoute for manager routes but make its non-manager redirect go to the role's home.
3. Login.jsx: after login, if `from` is '/' redirect admin -> '/admin', manager -> '/manager', requester -> '/'.
4. Navbar.jsx: for role admin show only one link, "Payments" -> /admin (also in the mobile drawer). Requester and manager menus unchanged. The brand link goes to the role's home.
5. ProfileEdit.jsx: for an admin, show the Grade/Group as a read-only (disabled) field with the admin's own value (including 'ابتدائي'), do not fetch the list for them, and still send the value on submit. After save navigate to the role's home. Requester behavior unchanged; Manager Tools section unchanged.
6. ItemBrowser/NewRequest etc. need no changes, but confirm an admin can never see them.

Run `npm run lint && npm run build` in client/. Final answer: files changed and the redirect behavior you implemented per role.
````

---

# PHASE B: Database for payments

## Step 6, DB: skipped

Not needed: step 0 showed there is no data to fix (0 null gradegroups, 0 completed requests with a null price), and `create_request` already stores the gradegroup on every request. A trigger or backfill would only add moving parts.

Optional cleanup: `create_request` exists in two versions (5 arguments and 6 arguments with `p_gradegroup`). The app always calls the 6-argument one. Leaving both can make a call with only 5 arguments ambiguous. Drop the old one only after you are sure nothing else calls it:

```sql
drop function if exists public.create_request(uuid, timestamptz, timestamptz, text, jsonb);
```

## Step 7, DB: payments + payment_requests tables, indexes, RLS

Design: `payments` holds one row per payment; `payment_requests` is the junction table that says which requests a payment covers. The `active` column is `true` while the payment is pending or approved. A partial unique index lets a request have only one active row, so the database itself prevents paying the same request twice. Declined or cancelled payments keep their junction rows (with `active = false`) as history.

```sql
-- 7.1 paid must never be null (run this first: steps 8 and 9 rely on it)
update public.requests set paid = false where paid is null;
alter table public.requests alter column paid set default false;
alter table public.requests alter column paid set not null;

-- 7.2 payments
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  gradegroup    text not null,                       -- the admin's group ('ابتدائي' or a single group)
  period_start  date not null,                       -- Cairo-local dates, inclusive
  period_end    date not null,
  total_price   integer not null check (total_price > 0),   -- whole EGP, same as requests.total_price
  request_count integer not null check (request_count > 0),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'declined', 'cancelled')),
  requested_by  uuid not null references public.users(id),
  decided_by    uuid references public.users(id),
  decision_note text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  constraint payments_period_check check (period_end >= period_start)
);

-- 7.3 junction table: which requests each payment covers
create table if not exists public.payment_requests (
  payment_id uuid not null references public.payments(id) on delete cascade,
  request_id uuid not null references public.requests(id),
  active     boolean not null default true,          -- true while the payment is pending or approved
  primary key (payment_id, request_id)
);

-- a request can be in only ONE active payment (enforced by the database)
create unique index if not exists uq_payment_requests_one_active
  on public.payment_requests (request_id) where active;

-- 7.4 indexes
create index if not exists idx_payment_requests_request_id on public.payment_requests (request_id);
create index if not exists idx_requests_gradegroup_start   on public.requests (gradegroup, start_time);
create index if not exists idx_payments_status_created     on public.payments (status, created_at desc);
create index if not exists idx_payments_requested_by       on public.payments (requested_by, created_at desc);

-- 7.5 lock the tables down: only the backend (service role) touches them
alter table public.payments         enable row level security;
alter table public.payment_requests enable row level security;
```

If you already ran a first version of these tables, drop them before running this step (they are empty): `drop table if exists public.payment_requests; drop table if exists public.payments;`

## Step 8, DB: scope helper + read functions

The three names in `admin_scope_groups` already match your `gradegroup` table (confirmed by step 0).

```sql
-- 8.1 Which grade groups an admin covers
create or replace function public.admin_scope_groups(p_gradegroup text)
returns text[]
language sql
immutable
as $$
  select case
    when btrim(p_gradegroup) = 'ابتدائي'
      then array['اول وتاني', 'تلاتة ورابعة', 'خامسة وسادسة']
    else array[btrim(p_gradegroup)]
  end
$$;
```

Sanity check for the mapping (expected result: **zero rows**; any row is a name that does not exist in your `gradegroup` table):

```sql
select n as missing_name
from unnest(public.admin_scope_groups('ابتدائي')) n
where n not in (select name from public.gradegroup);
```

`start_time` is `timestamptz` (confirmed by 0.1), so the Cairo-time expressions below work as written. In the queries below, `pr.payment_id is null` after the left join means "not in an active payment"; the unique index guarantees at most one active row per request, so the join never duplicates requests.

```sql
-- 8.2 Totals for a period (used by the admin page)
create or replace function public.admin_period_summary(p_admin_id uuid, p_start date, p_end date)
returns json
language plpgsql
stable
as $$
declare
  v_group    text;
  v_scope    text[];
  v_totals   jsonb;
  v_by_group jsonb;
begin
  select u.gradegroup into v_group
  from public.users u
  where u.id = p_admin_id and u.role = 'admin';

  if v_group is null then
    return json_build_object('success', false, 'code', 'not_admin');
  end if;

  v_scope := public.admin_scope_groups(v_group);

  select jsonb_build_object(
    'payable_count',       count(*) filter (where r.status = 'completed' and not r.paid and pr.payment_id is null),
    'payable_total',       coalesce(sum(r.total_price) filter (where r.status = 'completed' and not r.paid and pr.payment_id is null), 0),
    'missing_price_count', count(*) filter (where r.status = 'completed' and not r.paid and pr.payment_id is null and r.total_price is null),
    'pending_count',       count(*) filter (where pr.payment_id is not null and not r.paid),
    'pending_total',       coalesce(sum(r.total_price) filter (where pr.payment_id is not null and not r.paid), 0),
    'paid_count',          count(*) filter (where r.paid),
    'paid_total',          coalesce(sum(r.total_price) filter (where r.paid), 0)
  )
  into v_totals
  from public.requests r
  left join public.payment_requests pr on pr.request_id = r.id and pr.active
  where r.gradegroup = any (v_scope)
    and r.status <> 'rejected'
    and r.end_time <= now()
    and (r.start_time at time zone 'Africa/Cairo')::date between p_start and p_end;

  select coalesce(jsonb_agg(g order by g.gradegroup), '[]'::jsonb)
  into v_by_group
  from (
    select r.gradegroup,
           count(*)                        as request_count,
           coalesce(sum(r.total_price), 0) as total
    from public.requests r
    left join public.payment_requests pr on pr.request_id = r.id and pr.active
    where r.gradegroup = any (v_scope)
      and r.status = 'completed' and not r.paid and pr.payment_id is null
      and r.end_time <= now()
      and (r.start_time at time zone 'Africa/Cairo')::date between p_start and p_end
    group by r.gradegroup
  ) g;

  return (
    jsonb_build_object('success', true, 'gradegroup', v_group, 'scope', v_scope, 'by_group', v_by_group)
    || v_totals
  )::json;
end;
$$;
```

```sql
-- 8.3 Paged request list for the admin page
create or replace function public.admin_list_requests(
  p_admin_id uuid, p_start date, p_end date,
  p_limit integer default 20, p_offset integer default 0)
returns json
language plpgsql
stable
as $$
declare
  v_group text;
  v_scope text[];
  v_total integer;
  v_rows  json;
begin
  select u.gradegroup into v_group
  from public.users u
  where u.id = p_admin_id and u.role = 'admin';

  if v_group is null then
    return json_build_object('success', false, 'code', 'not_admin');
  end if;

  v_scope := public.admin_scope_groups(v_group);

  select count(*) into v_total
  from public.requests r
  where r.gradegroup = any (v_scope)
    and r.status <> 'rejected'
    and r.end_time <= now()
    and (r.start_time at time zone 'Africa/Cairo')::date between p_start and p_end;

  select coalesce(json_agg(t order by t.start_time desc, t.id desc), '[]'::json)
  into v_rows
  from (
    select r.id, r.start_time, r.end_time, r.status, r.gradegroup, r.total_price,
           r.paid,
           pr.payment_id,
           p.status       as payment_status,
           ru.full_name   as requester_name,
           (r.status = 'completed' and not r.paid and pr.payment_id is null) as payable,
           (select coalesce(json_agg(json_build_object('name', i.name, 'quantity', ri.quantity_requested)), '[]'::json)
              from public.request_items ri
              join public.items i on i.id = ri.item_id
             where ri.request_id = r.id) as items
    from public.requests r
    join public.users ru on ru.id = r.requester_id
    left join public.payment_requests pr on pr.request_id = r.id and pr.active
    left join public.payments p on p.id = pr.payment_id
    where r.gradegroup = any (v_scope)
      and r.status <> 'rejected'
      and r.end_time <= now()
      and (r.start_time at time zone 'Africa/Cairo')::date between p_start and p_end
    order by r.start_time desc, r.id desc
    limit p_limit offset p_offset
  ) t;

  return json_build_object('success', true, 'total', v_total, 'rows', v_rows);
end;
$$;
```

## Step 9, DB: write functions, status lock, grants

```sql
-- 9.1 Admin requests a payment (atomic; two admins or two clicks cannot double-pay)
create or replace function public.request_payment(p_admin_id uuid, p_start date, p_end date)
returns json
language plpgsql
as $$
declare
  v_group   text;
  v_scope   text[];
  v_ids     uuid[];
  v_count   integer;
  v_total   integer;
  v_missing integer;
  v_payment public.payments%rowtype;
begin
  select u.gradegroup into v_group
  from public.users u
  where u.id = p_admin_id and u.role = 'admin';

  if v_group is null then
    return json_build_object('success', false, 'code', 'not_admin');
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    return json_build_object('success', false, 'code', 'invalid_period');
  end if;

  v_scope := public.admin_scope_groups(v_group);

  -- Step 1: lock every request this admin could pay for, in a fixed order (no deadlocks).
  -- A concurrent call waits here until the other transaction has finished.
  perform r.id
  from public.requests r
  where r.gradegroup = any (v_scope)
    and r.status = 'completed'
    and r.paid = false
    and r.end_time <= now()
    and (r.start_time at time zone 'Africa/Cairo')::date between p_start and p_end
  order by r.id
  for update;

  -- Step 2: read the payable set. This is a separate statement, so it gets a fresh snapshot
  -- and sees any payment the other transaction just created.
  select array_agg(r.id), count(*), coalesce(sum(r.total_price), 0),
         count(*) filter (where r.total_price is null)
  into v_ids, v_count, v_total, v_missing
  from public.requests r
  where r.gradegroup = any (v_scope)
    and r.status = 'completed'
    and r.paid = false
    and r.end_time <= now()
    and (r.start_time at time zone 'Africa/Cairo')::date between p_start and p_end
    and not exists (
      select 1 from public.payment_requests pr
      where pr.request_id = r.id and pr.active
    );

  if v_count = 0 then
    return json_build_object('success', false, 'code', 'nothing_payable');
  end if;
  if v_missing > 0 then
    return json_build_object('success', false, 'code', 'missing_prices', 'missing_count', v_missing);
  end if;
  if v_total <= 0 then
    return json_build_object('success', false, 'code', 'zero_total');
  end if;

  insert into public.payments
    (gradegroup, period_start, period_end, total_price, request_count, requested_by)
  values
    (v_group, p_start, p_end, v_total, v_count, p_admin_id)
  returning * into v_payment;

  insert into public.payment_requests (payment_id, request_id)
  select v_payment.id, unnest(v_ids);

  return json_build_object('success', true, 'payment', to_jsonb(v_payment));
end;
$$;
```

```sql
-- 9.2 A manager accepts or declines (first decision wins)
create or replace function public.decide_payment(
  p_payment_id uuid, p_manager_id uuid, p_decision text, p_note text default null)
returns json
language plpgsql
as $$
declare
  v_payment public.payments%rowtype;
begin
  if p_decision not in ('approved', 'declined') then
    return json_build_object('success', false, 'code', 'invalid_decision');
  end if;

  if not exists (select 1 from public.users u where u.id = p_manager_id and u.role = 'manager') then
    return json_build_object('success', false, 'code', 'not_manager');
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    return json_build_object('success', false, 'code', 'not_found');
  end if;

  if v_payment.status <> 'pending' then
    return json_build_object('success', false, 'code', 'already_decided', 'status', v_payment.status);
  end if;

  update public.payments
  set status = p_decision,
      decided_by = p_manager_id,
      decided_at = now(),
      decision_note = nullif(btrim(p_note), '')
  where id = p_payment_id
  returning * into v_payment;

  if p_decision = 'approved' then
    -- the junction rows stay active: these requests are paid and locked for good
    update public.requests
    set paid = true
    where id in (select pr.request_id from public.payment_requests pr where pr.payment_id = p_payment_id);
  else
    -- release the requests so they can be paid again; the rows stay as history
    update public.payment_requests set active = false where payment_id = p_payment_id;
  end if;

  return json_build_object('success', true, 'payment', to_jsonb(v_payment));
end;
$$;
```

```sql
-- 9.3 (used by optional step 16) the admin cancels their own pending payment
create or replace function public.cancel_payment(p_payment_id uuid, p_admin_id uuid)
returns json
language plpgsql
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    return json_build_object('success', false, 'code', 'not_found');
  end if;
  if v_payment.requested_by <> p_admin_id then
    return json_build_object('success', false, 'code', 'forbidden');
  end if;
  if v_payment.status <> 'pending' then
    return json_build_object('success', false, 'code', 'already_decided', 'status', v_payment.status);
  end if;

  update public.payments
  set status = 'cancelled', decided_at = now()
  where id = p_payment_id
  returning * into v_payment;

  update public.payment_requests set active = false where payment_id = p_payment_id;

  return json_build_object('success', true, 'payment', to_jsonb(v_payment));
end;
$$;
```

```sql
-- 9.4 A request that belongs to a pending or approved payment cannot change status
create or replace function public.requests_block_status_change_in_payment()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and exists (
       select 1 from public.payment_requests pr
       where pr.request_id = old.id and pr.active
     ) then
    raise exception 'request_in_payment: this request is part of a payment and its status cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_requests_block_status_in_payment on public.requests;
create trigger trg_requests_block_status_in_payment
before update of status on public.requests
for each row execute function public.requests_block_status_change_in_payment();
```

```sql
-- 9.5 Only the backend (service role) may call these through the API
revoke all on function public.admin_scope_groups(text)                          from public, anon, authenticated;
revoke all on function public.admin_period_summary(uuid, date, date)            from public, anon, authenticated;
revoke all on function public.admin_list_requests(uuid, date, date, integer, integer) from public, anon, authenticated;
revoke all on function public.request_payment(uuid, date, date)                 from public, anon, authenticated;
revoke all on function public.decide_payment(uuid, uuid, text, text)           from public, anon, authenticated;
revoke all on function public.cancel_payment(uuid, uuid)                        from public, anon, authenticated;

grant execute on function public.admin_scope_groups(text)                          to service_role;
grant execute on function public.admin_period_summary(uuid, date, date)            to service_role;
grant execute on function public.admin_list_requests(uuid, date, date, integer, integer) to service_role;
grant execute on function public.request_payment(uuid, date, date)                 to service_role;
grant execute on function public.decide_payment(uuid, uuid, text, text)           to service_role;
grant execute on function public.cancel_payment(uuid, uuid)                        to service_role;

notify pgrst, 'reload schema';
```

**Quick SQL sanity test** (replace the UUID with a real admin id after you have created one):

```sql
select public.admin_period_summary('00000000-0000-0000-0000-000000000000', current_date - 30, current_date);
-- expected: {"success": false, "code": "not_admin"} for a non-admin id; real numbers for an admin id
```

**Consistency check** (run any time; expected result: zero rows). It finds paid requests that are not covered by an approved payment:

```sql
select r.id
from public.requests r
where r.paid
  and not exists (
    select 1
    from public.payment_requests pr
    join public.payments p on p.id = pr.payment_id
    where pr.request_id = r.id and pr.active and p.status = 'approved'
  );
```

**Rollback** (only if you need to undo steps 7 to 9):

```sql
drop trigger  if exists trg_requests_block_status_in_payment on public.requests;
drop function if exists public.requests_block_status_change_in_payment();
drop function if exists public.cancel_payment(uuid, uuid);
drop function if exists public.decide_payment(uuid, uuid, text, text);
drop function if exists public.request_payment(uuid, date, date);
drop function if exists public.admin_list_requests(uuid, date, date, integer, integer);
drop function if exists public.admin_period_summary(uuid, date, date);
drop function if exists public.admin_scope_groups(text);
drop table if exists public.payment_requests;
drop table if exists public.payments;
```

---

# PHASE C: Payments in the app

## Step 10, Code (server): admin endpoints

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first (the "API contract" there is the spec). Do ONLY this step. The SQL functions admin_period_summary, admin_list_requests and request_payment already exist in the database (step 9). Do not send emails yet (step 14).

1. server/src/utils/dates.js: parseDateOnly(value) returns the 'YYYY-MM-DD' string if it is a real calendar date, else null. Add validatePeriod(start, end) that returns an error message or null: both valid, start <= end, span <= 366 days.
2. server/src/controllers/adminController.js + server/src/routes/admin.js, mounted in app.js at /api/admin. Every route uses auth then requireRole('admin'):
   - GET /summary -> supabase.rpc('admin_period_summary', { p_admin_id: req.user.id, p_start, p_end }). Return the contract shape (the RPC already returns the fields flat, drop `success`).
   - GET /requests -> reuse parsePaging from requestsController (export it if needed); call rpc('admin_list_requests', { p_admin_id, p_start, p_end, p_limit: pageSize, p_offset: from }) and return { data: rows, total, page, pageSize }.
   - POST /payments body { start, end } -> rpc('request_payment', ...). Map: success -> 201 { payment }; code not_admin -> 403; invalid_period -> 400; nothing_payable / missing_prices / zero_total -> 409 with { error, code } (include missing_count for missing_prices); RPC error -> 500. Messages must be clear, human readable sentences.
   - GET /payments -> the admin's own payments from the `payments` table (select id, gradegroup, period_start, period_end, total_price, request_count, status, decision_note, created_at, decided_at), filter requested_by = req.user.id, newest first, paged with { count: 'exact' }.
   Validate start/end with the dates util on the three period routes and return 400 { error } on invalid input. Never accept an admin id or gradegroup from the request.
3. Tests (supertest, spy on supabase.rpc / use mockTables):
   - every route: 401 without token, 403 for requester and manager tokens, works for authHeader('admin').
   - invalid dates, start after end, span over 366 days -> 400, and the RPC is NOT called.
   - each RPC code maps to the right status and body.
   - the RPC is called with p_admin_id = the token's user id.

Run `npm test` in server/. Final answer: files changed and test results.
````

## Step 11, Code (client): admin payments page

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first (the "API contract" is the spec). Do ONLY this step. Steps 5 and 10 are done.

Files: client/src/api/admin.js (new), client/src/pages/admin/AdminPayments.jsx + AdminPayments.module.css (replace the placeholder), client/src/utils/format.js (new), client/src/components/ItemCard.jsx.

1. api/admin.js: getAdminSummary(start,end), getAdminRequests(start,end,page,pageSize), requestPayment(start,end), getMyPayments(page,pageSize) matching the contract.
2. utils/format.js: formatMoney(n) using Intl.NumberFormat with currency EGP and no decimals (prices are whole numbers), and formatDateTime. Fix ItemCard.jsx which shows "$" so it uses formatMoney.
3. AdminPayments page (follow Manager Dashboard patterns for layout, loading, error, mobile cards):
   - Header showing the admin's gradegroup (from the summary response) and, when the scope has several groups, the covered groups.
   - Period picker: two date inputs (start/end, default = first day of the current month to today; end cannot be before start). Changing the period refetches summary and list, and resets to page 1.
   - Summary cards: Payable, Pending approval, Paid (count + total each). When by_group has more than one entry show a small breakdown table (group, requests, total). If missing_price_count > 0 show a warning that payment is blocked until prices are fixed by a manager.
   - Pay button: disabled when loading, payable_count is 0, or missing_price_count > 0. Click opens a confirm dialog showing gradegroup, period and total; on confirm call requestPayment, then show a success message ("Sent to managers for approval") and refresh. Map 409 codes to clear messages.
   - Requests table (paged, 20 per page): date window, requester name, items, status, total price, and a badge: Payable / Pending approval / Paid / Cancelled. Table collapses to cards on mobile like the Dashboard.
   - "My payments" section: list of the admin's payments with period, group, total, status badge (pending/approved/declined/cancelled) and the manager's decision note when declined.
   - dir="auto" on gradegroup text, all money via formatMoney, no phone numbers anywhere.
4. Do not touch other pages.

Run `npm run lint && npm run build` in client/. Final answer: files changed and how each error code from the API is displayed.
````

## Step 12, Code (server): manager payments endpoints

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first (the "API contract" is the spec). Do ONLY this step. The SQL functions decide_payment and the trigger that blocks status changes already exist in the database (step 9). Do not send emails yet (step 14).

1. server/src/controllers/paymentsController.js + server/src/routes/payments.js, mounted in app.js at /api/payments. Every route uses auth then requireManager. Register /pending-count BEFORE /:id.
   - GET / -> list from `payments` with the admin's name (join users via the requested_by foreign key; verify the real FK name), optional ?status filter validated against pending|approved|declined|cancelled, newest first, paged with parsePaging and { count: 'exact' }, response { data, total, page, pageSize }.
   - GET /pending-count -> { count } of status 'pending' (use head:true / count:'exact').
   - GET /:id -> validate UUID (400 'Invalid payment ID'), return the payment with requested_by_name / decided_by_name, plus `requests`: load the included requests through the `payment_requests` junction table (rows with payment_id = :id, joined to requests) with requester full_name and request_items -> items(name) mapped to { name, quantity }. 404 if missing.
   - PATCH /:id/decision body { decision, note } -> validate; rpc('decide_payment', { p_payment_id, p_manager_id: req.user.id, p_decision, p_note }). Map codes: not_found 404, already_decided 409, invalid_decision 400, not_manager 403, RPC error 500. Success -> 200 { payment }.
2. requestsController.updateRequestStatus: when the RPC error message contains 'request_in_payment', respond 409 { error: "This request is part of a payment (pending or approved), so its status can't be changed.", code: 'request_in_payment' }. Any other RPC error stays 500.
3. Tests: auth/role gates (admin and requester tokens -> 403), status filter validation, UUID validation, each decide_payment code mapping, that p_manager_id comes from the token, the pending-count route is not captured by /:id, and the request_in_payment mapping.

Run `npm test` in server/. Final answer: files changed and test results.
````

## Step 13, Code (client): manager payments pages + navbar badge

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first (the "API contract" is the spec). Do ONLY this step. Steps 11 and 12 are done and client/src/utils/format.js exists.

Files: client/src/api/payments.js (new), client/src/pages/manager/Payments.jsx + Payments.module.css, client/src/pages/manager/PaymentDetail.jsx + PaymentDetail.module.css, App.jsx, Navbar.jsx.

1. api/payments.js: getPayments(params), getPendingPaymentsCount(), getPayment(id), decidePayment(id, decision, note).
2. Routes in App.jsx, both inside ManagerRoute: /manager/payments and /manager/payments/:id.
3. Payments.jsx: filter buttons like the Dashboard (Pending default, Approved, Declined, Cancelled, All). Each item is a card showing the requesting admin's name, gradegroup, period (start - end), request count, total (formatMoney), created time and a status badge, with a "Review" link. Pagination like the Dashboard.
4. PaymentDetail.jsx: summary block (admin, gradegroup, period, total, request count, status, who decided and when, decision note) and a table of the included requests (date window, requester, items, price) with a total row. If status is pending show a note textarea and two buttons: "Accept payment" (confirm dialog showing period, gradegroup and total) and "Decline payment". After deciding, refetch and show the result. On 409 already_decided show "Another manager already decided this payment" and refetch.
5. Navbar.jsx: for managers add a "Payments" link with a small badge showing the pending count. Fetch on mount, every 60 seconds while the tab is visible, and on route change; hide the badge when 0. Also expose a way for PaymentDetail to trigger a refresh after a decision (for example a lightweight event or a context value).
6. dir="auto" on gradegroup text. All money via formatMoney.

Run `npm run lint && npm run build` in client/. Final answer: files changed and how the badge refresh works.
````

## Step 14, Code (server): emails

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first. Do ONLY this step. Steps 10 and 12 are done.

1. In server/src/utils/emails.js add an escapeHtml helper and use it for every user-supplied string in the NEW emails (admin name, gradegroup, decision note). Do not rewrite the existing emails.
2. New emails following the existing wrapHtml/statusBadge style:
   - notifyManagersPaymentRequested(payment, admin, managers): subject "Payment approval needed: <gradegroup>"; body shows admin name, gradegroup, period (start - end), request count, total price in EGP, and a button/link to `${process.env.CLIENT_URL || 'https://wsa2l-el-2daa7.vercel.app'}/manager/payments/${payment.id}`. No accept/decline links, only a link into the app. Send to all managers sequentially with the existing small delay between emails and per-recipient try/catch.
   - notifyAdminPaymentDecision(payment, admin, manager): subject "Your payment was approved/declined", showing period, gradegroup, total, who decided and the decline note if any.
3. Orchestrators like sendNewRequestEmails: sendPaymentRequestedEmails(paymentId) and sendPaymentDecisionEmails(paymentId). They load what they need from Supabase (payment, requester admin, managers with role 'manager', deciding manager), catch and log errors, and never throw.
4. Wire them with runInBackground: after a successful POST /api/admin/payments (adminController) and after a successful PATCH /api/payments/:id/decision (paymentsController), AFTER the response is sent, same pattern as requestsController.
5. Skip sending when process.env.NODE_ENV === 'test' (as the existing functions do). Add CLIENT_URL to server/.env.example and the README env table.
6. Tests: escapeHtml; the email builders produce the period/group/total and escape a note containing <script>; controllers still return the same responses (mock the email functions).

Run `npm test` in server/. Final answer: files changed and test results.
````

## Step 15, End-to-end verification and docs

Do these by hand on a test deployment (or locally) with one manager, one admin for a single group, one admin for `ابتدائي`, and requesters in the matching groups.

1. Create a manager, then from `/manager/create-account` create an admin (group select appears only for Admin) and an `ابتدائي` admin. Confirm a requester can't see `ابتدائي` in Register.
2. Admin login lands on `/admin`. Typing `/`, `/requests` or `/manager` in the address bar redirects back to `/admin`. The admin can't edit their gradegroup.
3. Create completed requests in different groups and dates. An admin sees only their group; the `ابتدائي` admin sees all three subgroups with a breakdown.
4. Period boundaries: a request starting at 00:30 Cairo time on the end date is inside the period; one at 23:30 the day before the start date is outside.
5. Pay: the summary moves from Payable to Pending, a second Pay click gets "nothing payable", and the managers get the email and a navbar badge.
6. Two managers open the same payment: the first to accept wins, the second sees "already decided".
7. Accept: requests become paid, the admin sees Paid and gets the email. Decline with a note: the requests are payable again and the note shows up.
8. Try to change the status of a request that is in a pending or approved payment: blocked with the friendly message.
9. A completed request with a null price blocks the payment with the warning.
10. Update `README.md` (server and client), the spec's data model/API sections and `.env.example`.

## Step 16 (optional), Admin cancels a pending payment

The SQL (`cancel_payment`) is already in step 9.3.

````text
Read docs/admin-payments-plan.md, sections "Decisions" and "Shared context", first. Do ONLY this step. Steps 11 and 13 are done and the SQL function cancel_payment exists.

Server: add DELETE /api/admin/payments/:id (auth + requireRole('admin')) -> validate UUID, rpc('cancel_payment', { p_payment_id, p_admin_id: req.user.id }). Map codes: not_found 404, forbidden 403, already_decided 409, RPC error 500; success 200 { payment }. Tests for each mapping.
Client: in the "My payments" list of AdminPayments, show a "Cancel" button on pending payments (with a confirm dialog) that calls it and refreshes the summary and list. Cancelled payments show a "Cancelled" badge. Add api/admin.js cancelPayment(id).

Run `npm test` in server/ and `npm run lint && npm run build` in client/. Final answer: files changed.
````

---

## Still open

- Whether `users.gradegroup` has a foreign key to the `gradegroup` table (query in step 0 results). If it does, creating an `ابتدائي` admin fails.
- D1 to D9 stand as written unless you change them, especially D1 (no payment gateway) and D2 (`completed` requests only).
