# Lending App — Project Context & Spec (v1)

This document is the single source of truth for building v1. Please review, correct any
wrong assumptions, and confirm the RBAC matrix before implementation starts.

## 1. Tech Stack

- **Backend**: FastAPI (Python), MySQL (existing DB, DDL in `db/lending_db_ddl.sql`)
- **DB Access**: SQLAlchemy (core or ORM) + PyMySQL driver
- **Auth**: JWT (phone + password login), bcrypt password hashing
- **Frontend**: Static HTML + CSS + Bootstrap 5 + vanilla JavaScript (fetch API), Chart.js for dashboard charts
- **Exports**: `openpyxl` for Excel, `reportlab` for PDF
- **Config**: `.env` at repo root (already created with placeholders, gitignored)

## 2. Repo/Folder Structure (planned)

```
backend/
  app.py                     # FastAPI entrypoint, CORS, router mounting, static file serving
  config.py                  # loads .env
  database.py                # SQLAlchemy engine/session
  models.py                  # SQLAlchemy models (mirrors DDL + new columns)
  schemas/                   # Pydantic request/response models
  core_functions/
    auth.py                  # password hashing, JWT create/verify, get_current_user dependency
    rbac.py                  # role-based permission checks/decorators
    loan_calc.py             # installment schedule + interest calculations
    dashboard_service.py     # aggregation queries per role
    report_service.py        # filter + export (excel/pdf) logic
    file_storage.py          # KYC file save helper
  routers/
    auth.py                  # POST /auth/login, /auth/logout, /auth/me
    organizations.py         # super-admin only: create/list orgs
    users.py                 # onboard/list/activate/deactivate/delete app users
    customers.py              # onboard/list/activate/deactivate/delete customers
    loans.py                 # loan creation (linked to customer onboarding or separate)
    payments.py              # collect payment (installment/transaction creation)
    expenses.py               # enter/list expenses
    dashboard.py              # role-based summary endpoints
    reports.py                # filtered report data + excel/pdf export
  kyc/                        # uploaded customer photo/aadhaar/pan files (gitignored)
  requirements.txt
frontend/
  index.html                  # login
  dashboard.html
  customers.html               # list + filters + activate/deactivate/delete
  customer-onboard.html
  collect-payment.html
  expenses.html
  users.html                   # list + filters + activate/deactivate/delete
  user-onboard.html
  reports.html
  organizations.html            # super admin only
  assets/
    css/styles.css
    js/api.js                  # fetch wrapper, JWT storage/attach, auth redirect
    js/common.js                # navbar/sidebar rendering based on role
    js/<page>.js                 # per-page logic
db/
  lending_db_ddl.sql
  lending_db_sample_values.txt
.env                            # DB + JWT config placeholders (gitignored)
```

## 3. Database Changes Required

1. **New role row**: `INSERT INTO roles (id, role_name) VALUES (0, 'SUPER_ADMIN')`
2. **`customers.status`**: add column, e.g. `status VARCHAR(20) DEFAULT 'ACTIVE'` (`ACTIVE` / `INACTIVE`) to support activate/deactivate.
3. **System org for Super Admin**: since `users.org_id` is `NOT NULL` and references `organizations`, we will seed one reserved `organizations` row (e.g. `name = 'SYSTEM'`, a fixed `org_id`) to hold Super Admin user(s). This org is hidden from all org-scoped views/reports/dropdowns. Super Admin's dashboard only shows cross-org counts (see RBAC below), never org-specific financial data.
   - *Alternative*: make `users.org_id` nullable instead. Let me know which you prefer — **default: system org row**, since it avoids a schema change to a NOT NULL/FK column.
4. Migration script will be added as `db/migrations/001_v1_updates.sql` (additive only, does not touch existing sample data).

## 4. KYC File Storage Convention

- Folder: `backend/kyc/` (created, gitignored — contains PII)
- Naming: `{customer_id}_{proof_name}.{ext}` e.g. `750e8400-...440001_photo.jpg`, `750e8400-...440001_aadhaar.jpg`, `750e8400-...440001_pan.jpg`
- DB stores relative path in `customers.photo` / `customers.id_proof` (aadhaar+pan combined under `id_proof`, or we store aadhaar/pan as two files — **assumption: `id_proof` stores aadhaar file path; a second column reuse isn't available, so pan upload will reuse the same `id_proof` field as a second saved file unless you'd like a schema addition for a separate `pan_proof` column**). Flagging this for your review.

## 5. Auth & Multi-Org Model

- JWT payload: `user_id`, `org_id`, `role_id`, `name`.
- Every org-scoped query is automatically filtered by `org_id` from the JWT (except Super Admin).
- Super Admin (`role_id = 0`) is not tied to a real org's data; can only:
  - Onboard new Organizations
  - View a summary: total orgs, total users per org, total borrowers (customers) per org
  - Cannot view loans, transactions, expenses, or any financial customer-level detail.
- Org onboarding (by Super Admin) will optionally let the Super Admin create the first Admin (role_id=1) user for that org in the same flow (recommended) — please confirm.

## 6. RBAC Matrix (v1) — **please review**

Legend: ✅ Full access · 👁 View-only · ❌ No access · 🔸 Limited/own-data only

| Feature / Page                              | Super Admin (0) | Admin (1) | Manager (2) | Staff (3) | Collector (4) | Accountant (5)* |
|----------------------------------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Login                                         | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Onboard Organization                          | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View Org list / cross-org summary             | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dashboard (full org financial summary)        | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Dashboard (own collections only)               | ❌ | — | — | — | ✅ 🔸 | — |
| Onboard App User                              | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View App Users list                           | ❌ | ✅ | 👁 | ❌ | ❌ | ❌ |
| Activate/Deactivate/Delete App User            | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Onboard Customer (borrower)                    | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Customers list + filters                  | ❌ | ✅ | ✅ | ✅ | 🔸 search by phone only | 👁 |
| Activate/Deactivate/Delete Customer            | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Collect Payment                                | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Enter Expense                                  | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| View Reports & Export (Excel/PDF)              | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |

\* **Accountant role — my proposal (not specified by you), please confirm or adjust:**
Accountant gets full financial visibility (dashboard, reports, expenses) to support bookkeeping/reconciliation, but no customer onboarding, no user management, no payment collection (field activity), and no org onboarding. Can view customers/loans read-only for reference when reconciling reports.

**Assumptions flagged for your confirmation:**
- Manager can **view** the user list (read-only) but cannot onboard/edit/deactivate/delete users — only "user onboarding" was explicitly restricted for Manager; I extended that to full user management restriction except viewing. If you want Manager to have zero visibility into Users page, tell me and I'll set that cell to ❌.
- Staff cannot activate/deactivate/delete customers (treated as a sensitive status action), even though Staff has "full access except user onboarding/reports/dashboard". If Staff should be able to change customer status too, let me know.
- Collector's "search customer by phone" is a cut-down version of the Customers page (single search box, then payment collection), not the full filterable list.

## 7. Dashboard KPIs (per role)

- **Admin/Manager/Accountant** (org-scoped): total active loans, total disbursed, total collected (today/week/month), overdue amount & count, wallet balance, total expenses (this month), active customers count, recent transactions.
- **Collector**: today's collections (count & amount), this month's collections, list of recent payments they collected.
- **Super Admin**: total organizations, total app users (all orgs), total borrowers (all orgs) — a simple counts table, optionally per-org breakdown.

## 8. Core API Endpoints (draft, subject to change)

```
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/logout

POST   /api/organizations               (super admin)
GET    /api/organizations                (super admin)

POST   /api/users                        (admin)
GET    /api/users?org_id=&role_id=&status=
PATCH  /api/users/{user_id}/status
DELETE /api/users/{user_id}

POST   /api/customers                     (admin/manager/staff, multipart for KYC files)
GET    /api/customers?city=&status=&search=
PATCH  /api/customers/{customer_id}/status
DELETE /api/customers/{customer_id}

POST   /api/loans                          (create loan for a customer)
GET    /api/loans/{loan_id}/installments

POST   /api/payments/collect                (admin/manager/staff/collector)
GET    /api/customers/search?phone=

POST   /api/expenses
GET    /api/expenses?category=&date_from=&date_to=

GET    /api/dashboard/summary               (role-aware response)

GET    /api/reports/transactions?date_from=&date_to=&org_id=&status=&payment_mode=
GET    /api/reports/loans?...
GET    /api/reports/expenses?...
GET    /api/reports/export?type=excel|pdf&report=transactions|loans|expenses&...filters
```

## 9. Open Decisions Needing Your Confirmation

1. Super Admin org handling: **reserved SYSTEM org row** (default) vs. making `users.org_id` nullable?
2. Org onboarding flow: create the org's first Admin user in the same form (recommended) or as a separate step?
3. KYC: separate aadhaar vs pan file storage — reuse `id_proof` for both (as two files with different suffixes) or add a `pan_proof` column?
4. Accountant role scope — confirm or adjust the proposal in section 6.
5. Manager's visibility into the Users page (view-only vs none).
6. Staff's ability to change customer active/inactive status (yes/no).

---
Once you confirm/adjust the RBAC matrix and open decisions above, I'll proceed with the DB migration script, backend, and frontend build.
