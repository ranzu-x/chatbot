# Code Review — Chatbot SaaS

**Date:** 2026-09-25
**Scope:** `chatbot_api` (~38,000 lines, 64 route files, 63 utils, 77 migrations) and `chatbot_ui` (~84,000 lines, 177 files).
**Verdict:** Not ready for launch as-is. The architecture is sound — especially tenant isolation — but there are three unauthenticated ways to inject data into any workspace, weak session security, and no password reset. Items 1–7 are roughly a day of work.

---

## Status update (same day): items 1–7 fixed

| # | Status |
|---|---|
| 1 | Fixed. Telegram uses a per-bot `secret_token`; existing webhook bots are re-registered at startup. TikTok verifies `Tiktok-Signature`. TikTok's route was also being swallowed by the generic Meta route — fixed. The TikTok handler also no longer accepts another workspace's integration id. |
| 2 | Fixed. Requires a per-flow key, looks up the right table (`flows`, it used `bots`), checks the subscriber limit and really starts the flow. The UI shows the keyed URLs; its test form no longer has a default phone number. |
| 3 | Partly. Cookie is `secure` in production. The `localStorage` token stays: reseller custom domains call the API cross-site and depend on it. Removing it needs the API served on each custom domain first. |
| 4 | Fixed. Forgot/reset password pages + endpoints; a reset signs every other session out. Needs `node migrate_password_reset.js` and SMTP. |
| 5 | Fixed. `jspdf` was unused and removed; `npm audit` now reports 0 vulnerabilities. |
| 6 | Fixed. Unhandled rejections are logged instead of crashing; clean shutdown on SIGTERM/SIGINT. |
| 7 | Fixed. The public booking portal needs an unguessable key (`/book/:id?k=…`); the tenant attack test passes 15/15. |

**Found while fixing (new):**
- Five routers with public endpoints — the inbound webhook, the whole booking portal, and the developer API (`/public/v1`, API-key auth) — were mounted after `admin.js`'s blanket login check, so they answered 401 to every anonymous caller. The public booking page and the developer API could not have worked for real users. Moved; fixed.
- **Open — needs a decision:** the Meta webhook signature check accepts a WhatsApp payload with a wrong signature if it names an active phone number of the workspace. It exists for numbers whose app secret isn't configured; removing it requires configuring those first.
- The app server's and MySQL's clocks disagree by 6 hours on the dev machine. Anything comparing a JS time with a DB time can misbehave; the new code avoids it. The existing email-verification expiry still mixes the two clocks.
- Existing public booking links (`/book/<id>` without `?k=`) stop working — re-copy them from the Appointments page.

## Status update (same day, second pass): items 8–12 + maintainability

| # | Status |
|---|---|
| 8 | Fixed. `middleware/teamPermissions.js` (mounted after `tenantContext`) checks the Team Rules matrix on every write a team member (`USER`) makes: one rule table maps each route to its `feature.create/update/delete/special` key. Owners and platform staff are never gated; reads aren't gated. Test: `test/teamPermissions.test.js`. **Behaviour change:** a team member whose role lacks e.g. `connect_account.update` can no longer connect channels (the "Live Chat User" role doesn't have it). Sequences, labels, follow-ups, custom-field definitions and WhatsApp templates have no matrix key and stay open to team members. |
| 9 | Fixed. `npm run migrate` applies every script in `migrations.json` (fixed order) not yet in `schema_migrations` and records it; `--status` lists pending; `--mark-applied <file…/all>` records without running. Two destructive one-offs (`widget_key_rotation`, `integration_orphan_cleanup`) are manual-only. 11 old scripts swallowed errors and exited 0 — they now exit 1 on failure, so a failed script is never recorded. |
| 10 | Labelled. The package editor already tagged these "Saved only"; the user editor's expiry date and discount % now say so too. Customers never see these fields. Enforcing expiry (block vs downgrade) still needs a decision. |
| 11 | Fixed. Blog HTML is sanitised with DOMPurify on render; only YouTube/Vimeo iframes survive. |
| 12 | Fixed where it mattered. Every scheduler was checked: all but two already claim rows atomically. Broadcasts could double-send (two instances, or "Send now" racing the scheduler / a double-click) — `executeBroadcast` now claims the campaign atomically. Support-desk auto-close could double-log — now claims too. Commerce polling on two instances is safe (unique `event_key` + send claim). Still one instance recommended; `webhookQueue` is in-memory per process. |
| 13 | Open — needs a Shopify dev store. |

Maintainability: committed clutter removed from git and ignored (`*.log`, `.cursor/`, `_check*.mjs`, `inspect_*.js`) — **the widget-key log is still in git history**; those keys were rotated by that script, but rotate again if the repo was ever shared. `/hospital-admin/signup` alias removed (the git remote is already `chatbot`). Email-verification expiry now computed and compared in SQL. Large files, dark mode, UI lint and tests: still "as each area is touched".

---

## Fix before launch

### 1. Telegram and TikTok webhooks accept anyone
- **Where:** `chatbot_api/routes/webhook.js:1225` (`POST /webhook/telegram/:agencyId/:integrationId`) and the TikTok `POST /webhook/tiktok/...` handler below it.
- **Problem:** Neither verifies the caller. The ids in the URL are small sequential integers, so they are easy to guess. A forged request creates subscribers, runs flows and triggers real AI replies (billed tokens) in any workspace. Meta webhooks are verified correctly (`verifyMetaSignature`); these two are not.
- **Fix:** Telegram — pass a random `secret_token` when calling `setWebhook` (`routes/channels.js:1882`), store it on the integration, and reject requests whose `X-Telegram-Bot-Api-Secret-Token` header doesn't match. TikTok — verify the request signature with the app secret.

### 2. Inbound flow webhook: unauthenticated, and doesn't run the flow
- **Where:** `chatbot_api/routes/flowWebhooks.js:116` (`POST /webhooks/inbound/:flowId`).
- **Problem:** No key or secret is required, so anyone can create subscribers in any workspace by guessing a bot id. It skips the subscriber limit. It answers "Flow triggered successfully" but never actually starts the flow.
- **Fix:** Require a per-bot secret (in the URL or a header), check `max_subscribers`, and actually start the flow — or remove the endpoint until it does.

### 3. Weak session security
- **Where:** `chatbot_api/routes/auth.js:294` and `:375` (cookie), `chatbot_ui/src/Provider/AuthContext.jsx:75` (localStorage).
- **Problem:** The login cookie is hard-coded `secure: false`, so it can be sent over plain HTTP. The token is also stored in `localStorage`, where any injected script can read it — which defeats the point of the httpOnly cookie.
- **Fix:** `secure: process.env.NODE_ENV === "production"`; rely on the httpOnly cookie and stop storing the token in `localStorage` (the socket already accepts the cookie — see `utils/socket.js`).

### 4. No password reset
- **Problem:** There is no forgot-password / reset-password flow anywhere. A user who forgets their password is locked out permanently.
- **Fix:** Add `POST /auth/forgot-password` and `POST /auth/reset-password` using single-use, time-limited tokens — the same pattern as `email_verification_tokens` — rate-limited, and with a neutral response so it doesn't reveal which emails exist.

### 5. Vulnerable UI libraries
- **Where:** `chatbot_ui` dependencies — 9 advisories: 2 critical, 5 high, 2 moderate. Critical: `jspdf` (path traversal, code execution via PDF). Also `dompurify` (XSS), `fflate`.
- **Fix:** `npm audit fix` in `chatbot_ui`, then check PDF export still works. The API has 0 production advisories.

### 6. One unhandled error can stop the whole server
- **Where:** `chatbot_api/index.js`.
- **Problem:** There is no `process.on("unhandledRejection")` handler. On Node 22 a single unhandled promise rejection — e.g. in one of the 11 background schedulers — terminates the process, taking webhooks and the Inbox down with it. There is also no graceful shutdown on `SIGTERM`.
- **Fix:** Log unhandled rejections instead of crashing, wrap each scheduler tick in try/catch, and close the HTTP server and DB pool on `SIGTERM`. Run under a process manager (pm2/systemd) that restarts on exit.

### 7. Cross-reseller data leak in public appointment services
- **Where:** `GET /appointment-services/public` (`chatbot_api/routes/appointmentServices.js`).
- **Problem:** The tenant isolation attack test (`npm run test:tenant`) reports that this endpoint returns another reseller's data.
- **Fix:** Scope the query to the one workspace the public booking page belongs to, and return only the fields that page needs.

---

## Fix soon

### 8. Team role permissions look enforced but aren't
The team rules matrix (create / update / delete / special per feature) is saved, but no route checks those keys. A "Live Chat User" can still, for example, delete flows by calling the API directly. Only `team.*`, `roles.manage`-style keys and the per-role channel blocks are enforced. Add `requirePermission(...)` to each feature's mutating routes.

### 9. Database changes are deployed by hand
77 `migrate_*.js` scripts, no single command to run them, and only 17 record themselves in `schema_migrations`. It is easy to miss one when deploying. Add an `npm run migrate` runner that applies, in a fixed order, every script not yet recorded, and records each one.

### 10. Settings that look live but do nothing
Stored and shown only, not applied: package discount (incl. "apply to other packages"), pay/use, Whitelabel, reseller subscriber limit, subscription expiry date, user special coupon / discount %. Either wire them up or label them clearly for admins and customers.

### 11. Blog HTML rendered unsanitised
`chatbot_ui/src/Pages/Landing/BlogDetailPage.jsx:284` renders post HTML with `dangerouslySetInnerHTML`. Only admins author posts, but a compromised admin account could inject scripts into the public site. Sanitise with DOMPurify on save or render.

### 12. Must run as a single instance
11 schedulers run inside the API process (`setInterval`). Not every one has been checked for safety under two concurrent instances (e.g. pm2 cluster mode), so running two could double-send broadcasts or reminders. Run one instance, or move schedulers to one worker process with DB-level claims.

### 13. Shopify store automation untested against a live store
Built against Shopify's documentation only; WooCommerce was tested end-to-end against a local fake of its REST API. Connect a Shopify development store before relying on it.

---

## Maintainability

- **Tests:** 7 API test files (the tenant attack test is strong); no UI tests; no CI. UI lint: 65 problems (48 errors).
- **Very large files:** `FlowBuilderPage.jsx` 13,080 lines, `InboxPage.jsx` 5,426, `BotManagerPage.jsx` 3,068, `flowEngine.js` 2,574, `routes/channels.js` 2,258. Hard to change safely; split by feature as they are touched.
- **Dark mode:** 50 UI files hard-code white backgrounds instead of the theme variables in `index.css`, so those screens break in dark mode.
- **Committed clutter:** `chatbot_api/_check.mjs` (broken), `inspect_agencies.js`, `inspect_all.js`, `widget_key_rotation_*.log` (contains widget keys), `.cursor/debug-*.log`. Remove and add to `.gitignore`.
- **Leftovers from another project:** a `/hospital-admin/signup` route alias in `routes/auth.js` and `index.js`; the git remote is named `hospital_management`.

---

## What is already good

- Tenant isolation is designed in three layers and backed by a real test that attacks every route from another tenant.
- Every SQL query checked is parameterised; no SQL injection found.
- Secrets are encrypted at rest; Meta webhooks are signature-verified.
- Security headers (helmet), separate CORS for the dashboard and the website widget, rate limits on login and signup.
- The busiest tables (messages, conversations, contacts) are properly indexed.
- API production dependencies: 0 known vulnerabilities.

---

## Suggested order

1. Items 1–7 (about a day).
2. Items 8–9.
3. Maintainability items as each area is next touched.
