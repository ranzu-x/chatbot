# Chatbot SaaS — Project Notes

`chatbot_api` = Express + MySQL backend. `chatbot_ui` = React/Vite frontend.
Multi-tenant chatbot SaaS: Super Admin (Platform) → Reseller / End User → a
Reseller's own End Users → each of those has its own Team.

## Naming: "Reseller" / "User" — code and DB now match the UI

`users.role` is `ENUM('ADMIN','RESELLER','USER')`. The old `'AGENCY'`/
`'AGENT'` values (and every `roleMiddleware("AGENCY"/"AGENT", ...)` call,
JWT `role` claim, `INSERT INTO users ... role` literal, and frontend
`ROLE_HOME`/`NAV_CONFIG`/`ROLE_LABELS` map) were fully renamed to
`RESELLER`/`USER` — DB migration `migrate_rename_role_enum.js` (safe
widen → convert rows → narrow ENUM pattern). "Reseller" in the UI = `role
=== 'RESELLER'` in code, everywhere. "User" (a team member) in the UI =
`role === 'USER'` in code, everywhere. No more split between display text
and internal identifiers for this dimension.

**Dimensions that still legitimately use the word "AGENCY"/"AGENT"** —
these are separate concepts and were deliberately left alone (renaming them
would collide with the pre-existing distinct `'RESELLER'` value in the same
enum, or conflate unrelated things):

| Field | Meaning | Stays as-is |
|---|---|---|
| `agencies.account_type` | tenant type (`PLATFORM`/`DIRECT_CUSTOMER`/`RESELLER`/`RESELLER_CUSTOMER`) | already says `RESELLER` |
| `roles.scope_type` / `permissions.scope_type` | role-template scope (`PLATFORM`/`AGENCY`/`RESELLER`) | `AGENCY` here ≠ `users.role` |
| `roles.slug` (`agent`, etc.) / `agent_profiles.team_role` | legacy team-role slug — display name already fixed to "Live Chat User" in a prior phase | unchanged |
| `packages.type` | billing-package audience (`AGENCY`/`END_USER`/`TEAM_MEMBER`) | unchanged |
| `conversations.js`'s `senderType`, `appointments.booking_source` | who/what performed an action (`'AGENT'` = a human team member vs `'AI'`/bot) | unchanged |

If you see `'AGENCY'`/`'AGENT'` anywhere in the codebase, it's one of the
rows above — not `users.role`.

## Hierarchy quick reference

- **Reseller** (`agencies.account_type = 'RESELLER'`) — can create its own
  End Users and charge them; configures its own Meta/TikTok developer apps
  (`meta_app_settings` / `tiktok_app_settings`, one row per `agency_id`).
- **End User** (`account_type = 'DIRECT_CUSTOMER'`) — a Super Admin's direct
  customer, no reseller in between.
- **Reseller's End User** (`account_type = 'RESELLER_CUSTOMER'`,
  `parent_agency_id` → the Reseller) — uses the *Reseller's* Meta/TikTok
  app, not the Super Admin's, via `chatbot_api/utils/appCredentials.js`'s
  resolver (own app → parent Reseller's → Platform's, in that order).
- Every one of the above has its own Team (`organization_members`, USER-role
  users) with its own Team Roles & Permissions.

## Team members (USER) CAN connect channel accounts, but not app credentials

`routes/channels.js` (per-platform WhatsApp/Facebook/Instagram/Telegram/
TikTok/Webchat connect+manage endpoints) and `routes/integrations.js` (the
`/integrations` list backing `ConnectAccountsPage.jsx`'s hub) both allow
`USER` alongside `RESELLER`/`ADMIN`. Their `SELECT * FROM integrations`/
`telegram_bots` queries return live `access_token`/`user_access_token`/
`verify_token`/`bot_token` columns, so both files redact those fields via a
`stripSecrets(rows, req)` helper before responding to a `USER`-role
requester — `RESELLER`/`ADMIN` still see the raw values. `/channels/
instagram/import-accounts` (in `routes/metaapp.js`) is part of this same
flow and is widened too.

**Stays owner-only** (`RESELLER`/`ADMIN`, no `USER`): `/settings/meta-app`
and `/settings/tiktok-app` — these hold the Reseller's own Meta/TikTok
*developer app* credentials (`client_id`/`client_secret`), a materially
different and more sensitive thing than connecting one channel account
with those apps already configured.

## Tenant isolation (reseller A must never see reseller B)

Decided design, built in three layers. Read this before adding or changing any route that touches tenant data.

**Database** (`chatbot_api/migrate_tenant_isolation.js`, `migrate_chat_order_access_token.js`):
- `users.home_agency_id` — every login belongs to one workspace. Filled automatically by triggers when a user becomes an owner/member/agent, and immutable afterwards. `agencies.parent_agency_id` is the reseller pointer (no duplicate column).
- Triggers on `agencies`: a `RESELLER_CUSTOMER` must have a `RESELLER` parent, only customers may have a parent, a customer can never change reseller, a reseller with customers can't be demoted.
- Composite FKs `conversations(contact_id|integration_id, agency_id)`; triggers on `flows`/`bots` so an `integration_id` must be in the same workspace.
- `chat_orders.access_token`: checkout links are `/payments/pay/<id>?t=<token>`; the public order routes require it. `simulate-pay` is off when `NODE_ENV=production` and Stripe is configured.

**Code**:
- `middleware/tenant.js` (`tenantContext`, mounted globally in `index.js`) re-checks on every authenticated request that the user is active, the workspace exists and is active, and the user actually belongs to it. It sets `req.tenant` (`agencyId`, `resellerId`, account type). Deactivation therefore takes effect within seconds; call `invalidateTenantCache()` after any change to `is_active`/membership.
- Scope from `req.tenant`, never from `req.body/query/params`. Cross-tenant lookups answer 404, not 403.
- `utils/tenantDb.js` — `tenantDb(req).list/getOwned/insert/updateOwned/deleteOwned` add `agency_id` to every statement and only accept workspace-owned tables.
- `utils/resellerScope.js` — the only place that touches a reseller's customers/users; every function is anchored on the reseller id.
- **Locked files** (`tenant-lock.json`): `routes/resellerCustomers.js`, `routes/cannedResponses.js` may contain no raw SQL. `npm run lint:tenant` (runs before `npm test`) fails if they do. Converting another route file? Move its SQL behind `tenantDb`/a data layer, then add it to the lock. Never remove an entry. Unconverted files only produce warnings (`npm run lint:tenant -- --verbose`).
- Email stays unique platform-wide (decided). Emails-in-use errors on reseller flows use a neutral message so they don't reveal other resellers' users. There is deliberately NO "login as user" for resellers.

**Proof**: `npm run test:tenant` (opt-in, uses the real DB, cleans up after itself) builds two resellers each with a customer and a marked row in every tenant table, attacks every route from each tenant with the others' ids, and fails on any response containing another tenant's data or any change to another tenant's rows. `npm run check:tenant` is a read-only nightly integrity check. Any new route with an `:id` param may need an entry in `PARAM_OVERRIDES` in `test/helpers/tenantIsolation.js` if the param name doesn't match a table.

**Known gaps**: only routes whose id param maps to a seeded table are attacked (26 skipped: platform-global, provider-keyed, blog). Mutation routes get a generic body, so a leak behind specific validation may not be reached. Most route files are still unconverted (see `lint:tenant`). `/auth/register` on an unrecognised domain is refused (403 SIGNUP_NOT_AVAILABLE, no account created) except on a truly fresh install; only a verified reseller domain or a matching subdomain/slug can sign people up.

**Real-time (socket.io)** — `utils/socket.js` decides who a connection is from a verified login token (`auth.token` or the httpOnly `token` cookie), never from client-claimed `agencyId`/`userId`. Verified users join `agency:<id>` and `user:<id>`; `join_conversation` requires the conversation to be in their workspace; webchat visitors can only join the conversation their own visitor id created (`canJoinWebchat`). Every browser `io()` call must pass `auth: socketAuth()` (`chatbot_ui/src/utils/socketAuth.js`). Use `emitToUser` for personal alerts.

## Follow-up reminders (Inbox)

`follow_ups` rows have a title, optional description (`note`), `due_at`, optional assignee, `snooze_count` and `alerted_at` (NULL = has not fired for the current due time). `utils/followUpScheduler.js` runs every 30s, claims due PENDING rows by stamping `alerted_at`, and emits `follow_up_due` to the assignee's `user:<id>` room (or the creator if unassigned). Snoozing (`POST /follow-ups/:id/snooze {minutes}`) or changing the due time sets `alerted_at` back to NULL, which is all it takes to re-fire. UI: `Components/Inbox/FollowUpPanel.jsx` (create/edit/list in the subscriber drawer; 1/2/4/6/12/24-hour shortcuts) and `FollowUpAlerts.jsx` (bell + pop-ups + chime + desktop notification, in the conversation-list header). Reminders whose person had no tab open stay overdue and show in the bell (`GET /follow-ups?mine=1&status=OVERDUE`). Migration: `migrate_followup_reminders.js`.
