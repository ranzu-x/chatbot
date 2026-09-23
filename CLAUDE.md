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

## Bot scope (one bot account must never use another's components)

Beyond workspace isolation above, reusable components are walled **per bot account** (`integration_id`): a Sequence, a User Input Flow, or another Flow can only be used by flows/rules/AI actions of the **same** `agency_id` **and** `integration_id`. Decided rule from the user — "every bot only ever uses its own components, never another bot's or another user's".
- `utils/botScope.js` — `findOutOfScopeRefs` (deep-scans a flow's node `data` for `sequenceId` / `userInputFlowId` / `flowId`, incl. buttons, list items, Actions, Message Block elements), `stripComponentRefs` (used when cloning a flow onto a different bot), `getOwnedIntegration`. `routes/flows.js` create/save/clone enforce it (403 `BOT_SCOPE_VIOLATION`); a save that omits the bot account keeps the existing one.
- Engine (`utils/flowEngine.js`, `utils/aiActions.js`, `utils/commentPrivateReplyFlow.js`) scopes every lookup to the running flow's `integration_id`; `enrollContactsInSequence`/`unsubscribeContactFromSequence` take `integrationId` and only enroll contacts who have a conversation on the sequence's bot.
- A sequence's / form's bot account is set once and can never be moved (only a row with NULL may be assigned). `user_input_flows.integration_id` comes from `migrate_bot_scope.js` — unassigned forms are usable by no bot.
- List endpoints take `?integrationId=`; every builder picker passes the flow's bot (`currentIntegrationId` in `FlowNodeActionsContext`). **New reusable component type? Add its id key to `REF_KEYS` in `botScope.js`, an `integration_id` column, and scope its list/lookups.**
- Tests: `test/botScope.test.js`. Labels and custom fields stay workspace-wide (contact data, not bot components).

## Community Forum — a standalone portal, deliberately NOT tenant-isolated

Bug reports / feature requests / discussions / admin Announcements, at `/forum/*`. Read this before touching it — it breaks two rules the rest of the app follows, on purpose.

**Isolated from the dashboard, exactly like the Support Desk.** `chatbot_ui/src/Forum/` is one self-contained folder mounted as a single catch-all route (`<Route path="/forum/*" element={<ForumApp />} />`, same as `/support/*`). It has its own shell (`ForumShell`), its own session (`forum_auth_token` in `forumApi.js`, its own `ForumAuthContext`), its own axios client, its own toast/confirm UI (`ForumUIContext`), and its own design system (`forum.css`, `--fm-*` tokens under `.fm-root`). **Nothing in `Forum/` may import** `AppLayout`/`Sidebar`/`TopBar`/`ProtectedRoute`, the dashboard `AuthContext`, `services/api.js`, `utils/alerts.js`, or use `index.css` variables/classes. The forum's axios client sends `withCredentials: false` on purpose: the API also sets a dashboard `token` cookie and prefers it over a bearer header, so cookies must never reach the forum. The only dashboard touchpoint is an "open in a new tab" link in `TopBar.jsx`'s avatar menu (like Support) — not a Sidebar entry, not a dashboard route.

**Not tenant-isolated.** The forum is one shared, cross-tenant public community: a DIRECT_CUSTOMER can read and reply to a Reseller's thread. `author_agency_id` is stored for audit only and is never used to scope a read (`npm run lint:tenant` will warn about `routes/forum.js` — expected). What IS gated: who may post (`utils/tenantEligibility.js` → `DIRECT_CUSTOMER`/`RESELLER`, ADMIN bypasses; a Reseller's own `RESELLER_CUSTOMER` customers get nothing — the portal shows them a "not available" page and the API 403s any read that identifies them) plus a **verified email** (see Email verification below).

**Moderation.** A new thread is `PENDING_REVIEW` (visible only to its author and admins; everyone else gets 404) until an admin approves it; replies post immediately. Two independent fields: `moderation_status` gates visibility, `status` is the per-category resolution workflow (`utils/forumStatus.js` is the source of truth; `Forum/constants.js` mirrors it for rendering): Bug `OPEN→IN_PROCESS→RESOLVED`, Feature Request `OPEN→CONSIDERED→IN_PROCESS→IMPLEMENTED`, Discussion `OPEN→COMPLETED`, Announcement has none. Moderation lives inside the portal (`/forum/moderation`, ADMIN only), not in the dashboard.

**Mount order gotcha.** `routes/forum.js` is mounted in `index.js` *before* the routers with a bare `router.use(authMiddleware, …)` (next to `billingRoutes`/`commerceRoutes`), otherwise they 401 every anonymous read. It scopes its own auth per path. (`routes/blog.js` is mounted after them and currently 401s anonymous visitors — pre-existing, same cause.)

## Subscriber import (CSV / Google Sheet → one bot account)

`POST /contacts/import` (`routes/contacts.js`) **requires `integrationId`** — a subscriber is only ever imported *under one bot account* (a WhatsApp or Telegram integration of the caller's workspace; a member restricted to certain channels can't pick another). The contact's platform comes from the bot. "Belonging to a bot" = a `conversations` row on that integration (that is what bot-scoped sequences/broadcasts and the Account filter use). Those rows are created `RESOLVED` with no messages so 50,000 imports don't flood the Inbox's Open list; an inbound message opens a normal conversation as usual.
- **Label:** every imported/updated subscriber gets one label — `labelId`, or `labelName` (reused case-insensitively, else created). The UI defaults the name to the file / sheet name. `contacts.tags` is re-synced.
- **Mapping:** the *client* parses the file / sheet and applies the column mapping (`Pages/Contacts/subscriberUtils.js`: `prepareTable` → `guessMapping` → `buildImport`), so CSV and Google Sheet share one path. The server receives `rows[{name,email,phone|chatId,custom:{col:value}}]` + `customFields[{col,fieldId}|{col,name}]`. Any column that isn't phone/name/email becomes a custom-field value (existing field by id, or a new `TEXT` field named after the header; a soft-deleted field with the same key is revived).
- WhatsApp numbers are stored digits-only, so they match the wa_id the webhook creates. Blank cells never overwrite existing data. Max 50,000 rows — `IMPORT_MAX_ROWS` (contacts.js), `MAX_ROWS` (ImportModal.jsx) and `SHEET_IMPORT_MAX_ROWS` (routes/googleSheets.js) must stay in step. Sheet cells are read raw (`readSheetValues(..., { raw: true })`) so long numbers aren't returned as `8.8E+12`.
- **Body-size gotcha:** 50k rows is ~5–10 MB, past the global 5 MB JSON limit. `index.js` exempts this path from the global parser and mounts a 25 MB one *after* CORS and behind `authMiddleware`. Mounting it before CORS makes the browser report the upload as a "Network Error" (the preflight comes back without CORS headers).

## Email verification (account-level, soft-enforced)

`users.email_verified_at` is NULL until the user clicks the emailed link. **Soft enforcement, decided by the user:** nobody is blocked from signing in; the dashboard shows a "verify your email" banner (`Components/Auth/EmailVerifyBanner.jsx`, mounted in `Layout/AppLayout.jsx`, hidden for ADMIN) and only *some* features require it — today just Community Forum posting (`middleware/forumAccess.js`). To require it for another feature, gate on `email_verified_at` there; don't add a login block without asking.

- **Who must verify:** self-signup (`POST /auth/register`, all three branches) and guest-checkout buyers (`services/guestSignupService.js`) get an emailed link. Accounts an admin/reseller/team-owner creates are **inserted with `email_verified_at = NOW()`** (`routes/admin.js`, `routes/agency.js`, `routes/team.js`, `utils/resellerScope.js`, `seed.js`) — a logged-in person vouched for the address. **Any new "INSERT INTO users" path must pick one on purpose** (leave it NULL and send `sendVerificationEmail`, or set it).
- **Existing accounts** were backfilled as verified by `migrate_verify_existing_users.js`. That migration is ledger-guarded to run exactly once — re-running it would wrongly verify real new signups, so never remove the guard.
- **Endpoints** (`routes/auth.js`): `POST /auth/verify-email {token}` (public — the link is often opened on another device) and `POST /auth/resend-verification` (signed in; **one per minute per user**, 429 `RESEND_TOO_SOON` with `retryAfterSeconds`, computed in SQL so timezones can't skew it). Tokens are random 64-hex rows in `email_verification_tokens` (24h, single-use), not JWTs. `emailVerified` is in the login/register/`/auth/me` user payload.
- **UI:** signup shows a "Check your email" screen (`Pages/Register/Register.jsx` deliberately does NOT call `setUser` until "Continue" — `/register` is behind `PublicRoute`, which would redirect a signed-in user away and skip the screen); the emailed link opens `/verify-email` (`Pages/Auth/VerifyEmailPage.jsx`). The forum portal has its own `/forum/verify-email` page for links sent before this moved, calling the same `/auth` endpoints.
- **Email delivery:** one platform-wide SMTP account (`SMTP_*` in `chatbot_api/.env`; free providers are listed in `.env.example`). With SMTP unset, emails are only logged — and outside production the verification **link is printed to the server console** so local signup still works. Check a real setup with `npm run test:email -- you@example.com`.
