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

**Known gaps**: only routes whose id param maps to a seeded table are attacked (26 skipped: platform-global, provider-keyed, blog). Mutation routes get a generic body, so a leak behind specific validation may not be reached. Most route files are still unconverted (see `lint:tenant`). **Sign-up is open on every address (decided by the user, replacing the earlier "refuse unrecognised domains" rule).** `/auth/register` on an unrecognised domain (incl. the platform's own) creates a brand-new independent `DIRECT_CUSTOMER` workspace owned by the person (`utils/accountProvisioning.js` `createAccount`, same shape as guest checkout) — never a seat in, or child of, an existing tenant. A *verified* reseller domain creates a `RESELLER_CUSTOMER` of that reseller; an unverified one counts as unrecognised. A recognised DIRECT_CUSTOMER domain/subdomain still adds the person to that workspace as a team member (unchanged). `test/tenantIsolation.test.js` covers all three.

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

`POST /contacts/import` (`routes/contacts.js`) **requires `integrationId`** — a subscriber is only ever imported *under one bot account* (a WhatsApp or Telegram integration of the caller's workspace; a member restricted to certain channels can't pick another). The contact's platform comes from the bot. "Belonging to a bot" = a `conversations` row on that integration (that is what bot-scoped sequences/broadcasts and the Account filter use). Those rows are created `RESOLVED` with no messages. **The Inbox only lists conversations with at least one message** (`GET /conversations` requires `last_message_at IS NOT NULL`), so imported / manually added subscribers never appear there until someone writes in or is messaged.

**Inbox order + broadcasts.** `GET /conversations?sort=` — `received` (default: `last_inbound_at` DESC, never-replied chats last), `activity` (`last_message_at` DESC), `waiting` (last message is INBOUND, oldest first); `?noReply=1` = `last_inbound_at IS NULL` ("No reply yet" view). The UI (`InboxPage.jsx`, `SORT_OPTIONS`) also re-orders live `new_message` events by the same rule — change both together. Broadcasts (`broadcastRunner.js`) reuse the subscriber's existing conversation on that bot (active first, else the latest RESOLVED one) and never change its status; a new one is created `RESOLVED`. On a reply, `messageProcessor.findOrCreateConversation` re-opens a RESOLVED conversation the subscriber has never written in (`last_inbound_at IS NULL`) instead of starting a second one — a resolved chat with real history still starts fresh.
- **Label:** every imported/updated subscriber gets one label — `labelId`, or `labelName` (reused case-insensitively, else created). The UI defaults the name to the file / sheet name. `contacts.tags` is re-synced.
- **Mapping:** the *client* parses the file / sheet and applies the column mapping (`Pages/Contacts/subscriberUtils.js`: `prepareTable` → `guessMapping` → `buildImport`), so CSV and Google Sheet share one path. The server receives `rows[{name,email,phone|chatId,custom:{col:value}}]` + `customFields[{col,fieldId}|{col,name}]`. Any column that isn't phone/name/email becomes a custom-field value (existing field by id, or a new `TEXT` field named after the header; a soft-deleted field with the same key is revived).
- **Existing subscribers are never modified (decided with the user).** A number already on the workspace/channel (incl. older ids saved with "+"/spaces — mapped via normalisation) is SKIPPED: no name/phone/email/label/bot-link change. The one exception, also decided: the file's custom-field values ARE written onto them (`existingFieldsUpdated`). Repeats inside the file: the FIRST row wins, later ones count as `duplicateInFile`. New subscribers get `source = 'IMPORT'`; label, bot link and conversation are applied only to rows this import created (`id >= insertId`). The unique key `uq_contact(agency_id, platform, external_id)` is the DB-level guard (INSERT IGNORE). Response counts: `created, existing, existingFieldsUpdated, duplicateInFile, invalid, limitSkipped` (+ legacy `updated: 0, skipped`). The client sends each row's file line as `row`.
- WhatsApp numbers are stored digits-only (`normalizeWhatsAppNumber`: strips +, spaces, dashes, a leading 00 — never adds a country code), so they match the wa_id the webhook creates. Manual adds (`POST /contacts`) normalise the same way. Max 50,000 rows — `IMPORT_MAX_ROWS` (contacts.js), `MAX_ROWS` (ImportModal.jsx) and `SHEET_IMPORT_MAX_ROWS` (routes/googleSheets.js) must stay in step. Sheet cells are read raw (`readSheetValues(..., { raw: true })`) so long numbers aren't returned as `8.8E+12`.
- **Body-size gotcha:** 50k rows is ~5–10 MB, past the global 5 MB JSON limit. `index.js` exempts this path from the global parser and mounts a 25 MB one *after* CORS and behind `authMiddleware`. Mounting it before CORS makes the browser report the upload as a "Network Error" (the preflight comes back without CORS headers).

## Email verification (account-level, soft-enforced)

`users.email_verified_at` is NULL until the user clicks the emailed link. **Soft enforcement, decided by the user:** nobody is blocked from signing in; the dashboard shows a "verify your email" banner (`Components/Auth/EmailVerifyBanner.jsx`, mounted in `Layout/AppLayout.jsx`, hidden for ADMIN) and only *some* features require it — today just Community Forum posting (`middleware/forumAccess.js`). To require it for another feature, gate on `email_verified_at` there; don't add a login block without asking.

- **Who must verify:** self-signup (`POST /auth/register`, all three branches) and guest-checkout buyers (`services/guestSignupService.js`) get an emailed link. Accounts an admin/reseller/team-owner creates are **inserted with `email_verified_at = NOW()`** (`routes/admin.js`, `routes/agency.js`, `routes/team.js`, `utils/resellerScope.js`, `seed.js`) — a logged-in person vouched for the address. **Any new "INSERT INTO users" path must pick one on purpose** (leave it NULL and send `sendVerificationEmail`, or set it).
- **Existing accounts** were backfilled as verified by `migrate_verify_existing_users.js`. That migration is ledger-guarded to run exactly once — re-running it would wrongly verify real new signups, so never remove the guard.
- **Endpoints** (`routes/auth.js`): `POST /auth/verify-email {token}` (public — the link is often opened on another device) and `POST /auth/resend-verification` (signed in; **one per minute per user**, 429 `RESEND_TOO_SOON` with `retryAfterSeconds`, computed in SQL so timezones can't skew it). Tokens are random 64-hex rows in `email_verification_tokens` (24h, single-use), not JWTs. `emailVerified` is in the login/register/`/auth/me` user payload.
- **UI:** signup shows a "Check your email" screen (`Pages/Register/Register.jsx` deliberately does NOT call `setUser` until "Continue" — `/register` is behind `PublicRoute`, which would redirect a signed-in user away and skip the screen); the emailed link opens `/verify-email` (`Pages/Auth/VerifyEmailPage.jsx`). The forum portal has its own `/forum/verify-email` page for links sent before this moved, calling the same `/auth` endpoints.
- **Email delivery:** one platform-wide SMTP account (`SMTP_*` in `chatbot_api/.env`; free providers are listed in `.env.example`). With SMTP unset, emails are only logged — and outside production the verification **link is printed to the server console** so local signup still works. Check a real setup with `npm run test:email -- you@example.com`.

## Social Posting history (capped at 50) + monthly post quota

`social_posts` keeps only the latest 50 finished (PUBLISHED/FAILED) posts per workspace — `pruneSocialPostHistory` in `utils/socialPostHistory.js` deletes the oldest after every publish and after the scheduler finishes a post. SCHEDULED rows are never pruned. Because rows get deleted, the `max_posts_per_month` quota is **not** a row count: it reads the `social_post_usage` counter (`agency_id`, `month_start`), bumped by `recordSocialPostUsage` on every post row created (publish + schedule). New code that creates `social_posts` rows must call it. `GET /social-posts` is paged (`page`, `pageSize`, default 25; returns `total`). The UI's `HISTORY_LIMIT` mirrors `SOCIAL_POST_HISTORY_LIMIT`. Migration: `migrate_social_post_usage.js`.

## Super Admin user editor (full page)

`/admin/users/new` and `/admin/users/:id/edit` (`Pages/SuperAdmin/UserEditPage.jsx`) replaced the Super Admin's create/edit modal; the Reseller-scope `UsersPage` still uses the modal. Backed by `GET /admin/users/:id` (profile + workspace + active subscription + this month's usage) and one `PUT /admin/users/:id` that only changes the fields sent (`routes/admin.js`). Columns from `migrate_user_manager_fields.js`:
- `users.special_coupon` / `discount_percent` — **stored and shown only, not applied at checkout** (decided with the user; applying them is a follow-up).
- `users.can_forum_post` / `can_comment` — enforced by `requireUserPermission` (`middleware/forumAccess.js`) on thread create / reply; `can_comment` is also meant for blog comments once they exist.
- Expiry date is written to the active subscription's `expires_at`/`current_period_end`. **Nothing enforces expiry yet.**
- "Reset monthly usage" (`POST /admin/users/:id/reset-usage`) stamps `agencies.usage_reset_at`; the monthly counters in `utils/entitlements.js` count from the later of the 1st and that time (`USAGE_PERIOD_START`), and the current month's `social_post_usage` row is zeroed. Nothing is deleted.
- The Super Admin can manually verify / un-verify an email here (sets / clears `email_verified_at`).
- Reseller domain/subdomain editing reuses `routes/domains.js`'s cleaning + collision rules; a changed custom domain resets `domain_verified`.

## Package options + Team Role options (full option set)

Migration `migrate_package_role_options.js`. **Package editor** (`Pages/SuperAdmin/PackagesPage.jsx`): feature rows come from `Pages/SuperAdmin/packageFeatureConfig.js` (order, limit field, period, and an `enforced: {toggle, limit}` map). A row with `enforced` false shows a "Saved only" tag — **flip it when you wire that feature up.** Registry modules not in the config still render under the list, so a new module is never hidden.
- **A package with no `package_modules` row for a module treats it as DISABLED.** Adding a module = add a registry row AND backfill it enabled on every package (the migration does `INSERT IGNORE … SELECT id FROM packages`) AND add it to `getFallbackUnlimitedEntitlements` (reseller customers use that list).
- `packages.is_public = 0` → hidden from `/billing/plans` and refused by both checkouts (guest + `createCheckoutSession`); only the Super Admin can assign it. `is_highlighted` → pricing page opens on it with a "Recommended" tag.
- **Stored only, not applied (decided scope):** discount (`discount_*`, incl. "apply to other packages" which copies the fields), `pay_per_use`, `is_default_pay_per_use`, Whitelabel, reseller subscriber limit. Stripe checkout uses a fixed Price object — a dated discount needs Stripe coupons.
- "Disable WhatsApp/…" = the channel modules switched off. Connect Account / Team Member toggles are enforced through `LIMIT_TOGGLE_MODULES` in `entitlements.js`; new count limits (`max_sequences`, `max_comment_rules`, `max_appointment_services`, `max_whatsapp_flows`) through `COUNT_LIMITS`; `max_call_minutes_per_month` sums `whatsapp_calls.duration_seconds`.

**Team roles** (`Pages/Roles/teamRulesConfig.js`): every key there must exist in `permissions` (the PUT silently drops unknown keys). `restriction: true` actions (Number Mask) take access away, so bulk select-all skips them and no system role gets them. `roles.disabled_channels` (JSON) is enforced in `utils/teamAccess.js` `integrationAccessClause` (Inbox + import). The granular matrix keys are enforced for team members (`USER`) on writes by `middleware/teamPermissions.js` (one RULES table, mounted after `tenantContext`; owners/ADMIN and GETs are never gated; 403 `TEAM_PERMISSION_DENIED`). **New write route for a matrix feature? Add a rule there** — `test/teamPermissions.test.js` checks every key exists in `teamRulesConfig.js`. Sequences, labels, follow-ups, custom-field definitions and templates have no matrix key and stay open.

## Migrations

`npm run migrate` (`scripts/migrate.mjs`) runs every `migrate_*.js` listed in `chatbot_api/migrations.json` that is not in `schema_migrations`, in that order, and records it (`--status`, `--mark-applied <file…|all>`). **New migration: append it to the end of `order`** (the runner refuses to start otherwise), keep it idempotent, and make it exit non-zero on failure (never `process.exit(0)` in a `finally`). `manual` entries are destructive one-offs that never auto-run. Fresh DB: import `schema.sql`, then `npm run migrate`.

## Public endpoints, webhook auth, sessions (review fixes 2026-09-25)

- **Mount order:** `admin.js` (and several others) do a bare `router.use(authMiddleware)`, so any router mounted after them answers 401 to every anonymous request. Routers with public endpoints are mounted early in `index.js`, next to billing/commerce/forum: `flowWebhookRoutes`, `appointmentRoutes`, `appointmentServicesRoutes`, `slotRoutes`, `publicApiRoutes`. **A new public endpoint must go in one of those, or its router must be mounted there** (and must scope its own auth by path).
- **Unguessable keys for public URLs** (ids are small sequential ints): `utils/webhookAuth.js` — Telegram `secret_token` (set on `setWebhook`, checked from `X-Telegram-Bot-Api-Secret-Token`; `ensureTelegramWebhookSecrets()` re-registers webhook bots at startup), TikTok `Tiktok-Signature` HMAC with the app client secret, inbound flow webhook `?key=` (owner fetches URLs from `GET /webhooks/inbound-urls`). `utils/publicBooking.js` — booking portal `/book/:agencyId?k=<key>`; the 4 public booking endpoints need the key unless the caller is signed in to that workspace. All keys derive from `WEBHOOK_SECRET_KEY` (falls back to `JWT_SECRET`) — **changing it breaks every shared booking link and Zapier URL.**
- `webhook.js` has `router.param("agencyId")` → non-numeric values skip to the next route (the generic Meta routes used to swallow `/webhook/tiktok/:id`).
- **Known open issue:** `verifyMetaSignature` still *accepts* a WhatsApp payload with a wrong/missing signature when it names an active phone number of the workspace (fallback for numbers whose app secret isn't configured). Removing it needs every WhatsApp integration to have its app secret first — decide with the user.
- **Password reset** (`utils/passwordReset.js`, `migrate_password_reset.js`): hashed single-use tokens, 1h, throttled per account + IP, neutral answer. A reset bumps `users.token_version`; every login token carries `tv` and `isTokenRevoked` (middleware/tenant.js, also `/auth/me` and the socket) rejects older ones. **Use the counter, never compare JWT `iat` with a DB timestamp** — the app and MySQL clocks can disagree (on the dev machine by 6 hours). Likewise compute DB expiries in SQL (`NOW() + INTERVAL`), not in JS. Any new `jwt.sign` of a login token must include `tv`.
- Login cookie is `secure` when `NODE_ENV=production`. The token is ALSO kept in `localStorage` and sent as a Bearer header on purpose: reseller custom domains call the API cross-site, where the SameSite=Lax cookie isn't sent. Dropping localStorage needs the API served same-site on every custom domain first.
- `index.js` logs `unhandledRejection` instead of crashing, exits on `uncaughtException`, and shuts down cleanly on SIGTERM/SIGINT (10s cap). Run under pm2/systemd.

## Store automation (Shopify / WooCommerce → WhatsApp)

Order notifications, COD verification and abandoned-cart recovery, modelled on BotSailor. Migration `migrate_commerce_automation.js`.
- **Connect** (`routes/commerce.js`, UI `Components/Commerce/StoreConnectionsManager.jsx`, shown in Settings → App Integrations → Store API *and* Automation → Commerce → Store Connections): Shopify = store subdomain + Admin API token (`shpat_`, never expires) **or** Dev Dashboard client id + secret (client-credentials grant, 24h token refreshed by `getShopifyToken`). WooCommerce = store URL + REST consumer key/secret (Read/Write). Credentials are verified live, then stored encrypted; many stores per workspace. Connect/disconnect is owner-only. The old Partner-app OAuth flow (unsigned `state` = agency id) was removed on purpose. In production a Woo URL must be HTTPS and must not resolve to a private IP (SSRF guard in `normalizeWooUrl`).
- **Engine** `utils/commerceEvents.js` — **polling, not webhooks** (decided: works with admin-token apps that have no signing secret and on servers without a public URL; ~1 min latency). Every 60s it reads orders/checkouts `updated_at > cursor` (Shopify Admin GraphQL `SHOPIFY_API_VERSION`, Woo REST `modified_after`), upserts `commerce_orders`/`commerce_carts`, detects transitions and queues `commerce_campaign_sends` rows. `UNIQUE(campaign_id, event_key)` = each event fires once. The cursor starts at connect time and "order created"/COD only fire for orders created after connecting — **connecting never messages past orders.** Every 20s due rows are sent as the campaign's approved template (contact `source = 'INTEGRATION'`, conversation via `findOrCreateConversationForBroadcast`, subscriber + message-credit limits apply). A crash mid-send → FAILED, never retried (could double-message).
- **Carts:** Shopify `abandonedCheckouts` (completedAt → RECOVERED). WooCommerce has no cart API: carts are `checkout-draft` (block checkout only), `pending` and `failed` orders; the same order id turning into a real order marks the cart RECOVERED and fires "order created". Classic-checkout carts with no draft order are invisible (a WP plugin would be needed). A cart is re-checked at send time and SKIPPED if recovered; the delay restarts when the customer touches the checkout again.
- **COD:** the template's first two QUICK_REPLY buttons get payloads `CMC:<sendId>:Y|N`. `routes/webhook.js` now passes `msg.button.payload` as `buttonRoute`; step 4a hands `CMC:` taps to `handleCommerceButton` **only from the contact the message was sent to**. Shopify: tags `COD Confirmed`/`COD Cancelled`, optional `orderCancel` (needs `write_orders`). Woo: order note, optional status processing/cancelled. First answer wins.
- Template variables: `variable_map {header|body: {placeholder: source}, buttons: {index: source}}`; source = a `COMMERCE_FIELDS` id or `text:…`. Positional `{{1}}` and named placeholders both work; a URL button's `{{1}}` gets the `*_url_path` values. The field/trigger lists live only in `commerceEvents.js` and reach the UI through `GET /commerce/meta`.
- Not verified against a live store (none available): Shopify was checked against the docs only; WooCommerce was tested end-to-end against a local fake of its REST API.

## User Manager bulk actions + in-app notifications (top-bar bell)

User Manager → Options → **Selected users ▸** (`UsersPage.jsx`, dialogs in `Pages/SuperAdmin/BulkUserActions.jsx`): Send email, Send notification (Super Admin scope only), Download as CSV (client-side, `utils/csv.js`). Backend: `POST /admin/users/bulk-email` (plain text → escaped HTML, `{{name}}` placeholder, max 500 users, uses `sendAdminEmail` which reports `sent`/`failed`/`not_configured` — the UI warns when SMTP isn't set) and `POST /admin/users/bulk-notify` (links must be `/path` or `http(s)://`). Notifications live in `user_notifications` (`migrate_user_notifications.js`), are pushed live with `emitToUser(id, "user_notification")`, and are read/marked only by their owner via `routes/userNotifications.js` (`/me/notifications`, mounted before `notificationRoutes`). The bell (`Components/NotificationBell.jsx`, state in `Provider/NotificationContext.jsx`) replaced the old top-bar button that opened notification settings — settings are now the dropdown's footer link.

## Subscriber source + dashboards (Super Admin / Reseller / Workspace)

`contacts.source` ENUM `INCOMING` (default — messaged a bot, public booking) · `INTEGRATION` (inbound webhook, `routes/flowWebhooks.js`) · `IMPORT` · `MANUAL`. **Subscriber gain (every chart) counts only INCOMING + INTEGRATION** — imports and manual adds are never gain. Any new `INSERT INTO contacts` must set the right source. Migration `migrate_subscriber_source_and_earnings.js` added it with a one-time best-effort backfill (no external id → INTEGRATION, no conversation → MANUAL, conversation but never wrote in → IMPORT).

Dashboards read one aggregate endpoint each — `GET /admin/dashboard` (platform) and `GET /agency/dashboard` (scoped from `req.tenant`), both `?month=YYYY-MM` for the daily-gain chart — built in `utils/dashboardStats.js` (SQL aggregates only). Widgets: `Components/Dashboard/{EarningsWidgets,DailyGainChart,AutomationReports,DashboardCard}.jsx`.
- **Earnings** = paid `invoices` in USD; BDT converted at the Platform Settings USD→BDT rate; other currencies ignored. Cards: total / this month (vs last month) / this year (vs same period last year), plus month-by-month this-year-vs-last-year and top countries.
- **Country** = `invoices.country` (ISO-2), set when a payment is recorded (`utils/country.js` `resolveInvoiceCountry`): the gateway's billing/card country (Stripe billing address, SSLCommerz card issuer), else the paying owner's phone country (libphonenumber-js). NULL shows as "Unknown". Flags: `flag-icons` CSS (emoji flags don't render on Windows).
- **Resellers can't collect payments yet**, so their earnings block is `available: false` with zeros and an explanation (decided with the user — no estimates). Their "Total Users" = their RESELLER_CUSTOMER workspaces (`resellerScope.countCustomers`). Direct customers / team members get no earnings or users block.
- Subscribers list `GET /contacts?sequenceId=any|none|<id>` — "assigned" = an enrolment that isn't STOPPED, always joined to `sequences.agency_id`.
- No chart may fall back to invented numbers: `SubscriberGainChart` used to draw random "sample" data on empty workspaces — removed; empty = real zeros / an empty state.
