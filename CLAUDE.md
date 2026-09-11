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
