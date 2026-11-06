# Rikash Finance — Architecture & Implementation Plan

## 0. Findings from inspecting the environment

| Item | Finding | Consequence |
|---|---|---|
| `C:\Rikash_project` | Empty, not a git repo | Greenfield build, nothing to preserve |
| Node / npm | Node 24, npm 11 | No pnpm; use npm |
| Local Postgres / Docker | Not installed | Need a hosted Postgres (Supabase) for migrations and integration checks |
| Supabase account | One project, `My Project` (ap-south-1), is a **live CRM** (~50k rows: customers, quotes, invoices, payments, chat). It already has `public."User"` and `public."Project"` tables | **Must not be used for this app.** Finance data needs its own project |
| Handwritten notes | Quick Entry, Dashboard, Gpay, Credit Cards, Monthly Due, Slice, Dept, Cart, Milestone, Savings. Gpay, Credit Cards and Monthly Due are struck through, Cart and Savings are circled | The written spec (nine modules) is the source of truth. Notes read as: Dept = Debt, Cart = Card Management. Gpay is not in the spec, so it is treated as an account type (digital wallet) |

## 1. Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui · PostgreSQL · Prisma · Supabase Auth (`@supabase/ssr`) · TanStack Query · React Hook Form + Zod · Recharts · Zustand (UI state only) · Lucide · Vitest.

## 2. Core design decisions

### 2.1 Money
* DB columns are `Decimal(14,2)` (never float).
* The calculation engine works on **integer paise** (`number`) so there is no floating point drift. A tiny boundary layer converts `Decimal ⇄ paise`.
* Display uses `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` (lakh/crore grouping).

### 2.2 Ledger model: one pure function decides what each transaction does
`src/lib/finance/ledger.ts` exports `effectsOf(transaction)`: a pure function that returns
* `balanceEffects[]`, the deltas on accounts, cards, savings accounts, debts and credit lines
* `reporting`, how the transaction counts in income / expense / savings reports

The database layer only *applies* those deltas inside one `prisma.$transaction`. Create, edit and delete all go through the same path: reverse the old effects, apply the new ones. Balances therefore cannot drift, and a `reconcile` routine can recompute every balance from the ledger to prove it.

| Type | Account balance | Other balance | Counts as income | Counts as expense |
|---|---|---|---|---|
| Income | + | | yes | |
| Expense (account) | − | | | yes |
| Expense (credit card) | | card outstanding + | | **yes, at purchase** |
| Credit card payment | − | card outstanding − | | **no** (avoids double counting) |
| Debt payment / EMI | − | debt outstanding − | | no (liability settlement; interest shown in Debt module) |
| Subscription | − | | | yes |
| Savings deposit | − | savings + | | no |
| Savings withdrawal | + | savings − | | no |
| Transfer | from −, to + | | **no** | **no** |

### 2.3 User isolation (defence in depth)
1. Every request resolves the user from the verified Supabase session (`auth.getUser()`), never from client input.
2. All queries go through a data layer that **requires `userId`** and always filters by it; foreign ids supplied by the client are re-checked to belong to the same user.
3. Postgres Row Level Security is enabled on every table with **no policies** for `anon`/`authenticated`. The Supabase REST API cannot read these tables at all. Prisma connects with the server-side database role.
4. No sensitive field is sent to the browser: card numbers are stored only as last-4 plus an encrypted blob (AES-256-GCM, server key). CVV/PIN are never accepted or stored.

### 2.4 Idempotent automation
* Recurring generation: unique `(recurring_payment_id, due_date)`; inserts use `ON CONFLICT DO NOTHING`.
* Reminders: unique `(user_id, kind, ref_type, ref_id, remind_on)`.
* Monthly summaries: unique `(user_id, month)`.
* Cron endpoints are protected by `CRON_SECRET`, run per user in their own DB transaction, and can be re-run safely.

### 2.5 Audit and soft delete
* `deleted_at` on transactions, accounts, cards, debts, savings, milestones, dues.
* `audit_logs` (who, what, entity, before/after JSON, time) written inside the same DB transaction as the change.

## 3. Database schema (tables)

`users`, `user_profiles`, `accounts` (bank, cash, wallet, debit card, other, plus credit-line types such as Slice), `credit_cards`, `credit_card_statements`, `transaction_categories`, `transactions`, `attachments`, `recurring_payments`, `monthly_dues`, `payment_records`, `debts`, `debt_payments`, `savings_accounts`, `savings_transactions`, `milestones`, `milestone_contributions`, `reminders`, `monthly_summaries`, `audit_logs`.

Every table has `id` (uuid), `user_id` (indexed, FK), `created_at`, `updated_at`. Money is `Decimal(14,2)`. Composite indexes on `(user_id, date)` for transactions, `(user_id, due_date, status)` for dues.

## 4. Module map

| Module | Route | Backed by |
|---|---|---|
| Quick Entry | `/quick-entry` plus global quick-add dialog | transactions, attachments |
| Dashboard | `/dashboard` | aggregate queries over all tables, date-range filters |
| Credit Cards | `/credit-cards` | credit_cards, statements, transactions |
| Monthly Due | `/monthly-due` | recurring_payments, monthly_dues, payment_records |
| Slice | `/slice` | accounts (credit-line type) and transactions |
| Debt Management | `/debt` | debts, debt_payments |
| Card Management | `/accounts` | accounts |
| Milestones | `/milestones` | milestones, milestone_contributions |
| Savings | `/savings` | savings_accounts, savings_transactions |

## 5. Folder structure

```
src/
  app/
    (auth)/login, signup
    (app)/layout.tsx            # sidebar shell, auth guard
    (app)/<module>/page.tsx
    api/cron/{recurring,reminders,summary}/route.ts
  components/ui/                # shadcn
  components/shared/            # DataTable, KpiCard, FilterBar, ConfirmDialog, ChartCard, EmptyState
  features/<module>/            # schemas.ts, actions.ts, queries.ts, components/
  lib/
    finance/                    # money.ts, ledger.ts, debt.ts, savings.ts, dates.ts  (pure, unit-tested)
    db/                         # prisma client, scoped data layer, audit
    supabase/                   # server, client, middleware
    security/                   # crypto, rate-limit, upload validation
  server/jobs/                  # recurring, reminders, summaries
prisma/schema.prisma, migrations/
tests/
docs/
```

## 6. Environment variables

`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY` (server only, receipts bucket), `CARD_ENCRYPTION_KEY` (32 bytes, base64), `CRON_SECRET`.

## 7. Phases

1. **Foundation**: scaffold, tooling, Prisma schema + migration, finance engine + unit tests
2. **Auth and shell**: Supabase auth, middleware guard, sidebar, theme, shared components
3. **Money core**: Accounts, Quick Entry, transactions (create/edit/delete/duplicate warning)
4. **Credit Cards, Slice, Monthly Due** (plus recurring generation)
5. **Debt, Savings, Milestones**
6. **Dashboard** (aggregates and charts)
7. **Automation, security hardening, docs, test and build verification**

Each phase ends with typecheck, lint, tests and a build.

## 8. Open decision (needs the user)

A **new Supabase project** for finance data (recommended, free tier is enough), or credentials for a Postgres of the user's choice. Until then, schema/engine/UI work proceeds, and migrations are generated as SQL ready to apply.
