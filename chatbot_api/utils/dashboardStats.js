/**
 * Aggregates behind the Super Admin + Reseller / Workspace dashboards
 * (GET /admin/dashboard, GET /agency/dashboard). Everything is computed with
 * SQL aggregates — nothing is loaded row by row into Node or the browser.
 *
 * Scopes:
 *   { kind: "platform" }                 Super Admin — the whole platform
 *   { kind: "workspace", agencyId }      one workspace's own data
 *
 * Earnings = platform billing (invoices, status PAID), reported in USD: BDT
 * payments are converted at the platform's USD→BDT rate (Platform Settings).
 * Invoices in any other currency are ignored (none are created today).
 * Resellers don't collect payments through the platform yet, so reseller
 * earnings are reported as unavailable (decided with the user) rather than
 * estimated.
 *
 * Subscriber gain = contacts.source INCOMING or INTEGRATION — CSV / Sheet
 * imports and manual adds are never counted (migrate_subscriber_source_and_earnings.js).
 */
import pool from "../db.js";
import { getUsdToBdtRate } from "./platformGateways.js";

export const GAIN_SOURCES = ["INCOMING", "INTEGRATION"];

const usdExpr = `CASE UPPER(i.currency) WHEN 'USD' THEN i.amount_paid WHEN 'BDT' THEN i.amount_paid / ? END`;
const PAID = `i.status = 'PAID' AND UPPER(i.currency) IN ('USD', 'BDT')`;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** "2026-09" → { year, month (1-12), start: Date, days } — defaults to the current month. */
export function parseMonth(value) {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) { year = Number(m[1]); month = Number(m[2]); }
  const days = new Date(year, month, 0).getDate();
  return { year, month, days, key: `${year}-${String(month).padStart(2, "0")}` };
}

// ─── Earnings (platform only) ────────────────────────────────────────────────

export async function getPlatformEarnings() {
  const rate = await getUsdToBdtRate();
  const [[s]] = await pool.query(
    `SELECT
       COALESCE(SUM(${usdExpr}), 0) AS total,
       COALESCE(SUM(CASE WHEN i.paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN ${usdExpr} END), 0) AS month,
       COALESCE(SUM(CASE WHEN i.paid_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-01')
                          AND i.paid_at < DATE_FORMAT(NOW(), '%Y-%m-01') THEN ${usdExpr} END), 0) AS lastMonth,
       COALESCE(SUM(CASE WHEN i.paid_at >= MAKEDATE(YEAR(NOW()), 1) THEN ${usdExpr} END), 0) AS year,
       COALESCE(SUM(CASE WHEN i.paid_at >= MAKEDATE(YEAR(NOW()) - 1, 1)
                          AND i.paid_at < NOW() - INTERVAL 1 YEAR THEN ${usdExpr} END), 0) AS lastYearToDate,
       COUNT(*) AS payments
     FROM invoices i WHERE ${PAID}`,
    [rate, rate, rate, rate, rate]
  );

  // Current vs previous year, month by month.
  const [monthly] = await pool.query(
    `SELECT YEAR(i.paid_at) AS y, MONTH(i.paid_at) AS m, SUM(${usdExpr}) AS amount
     FROM invoices i
     WHERE ${PAID} AND i.paid_at >= MAKEDATE(YEAR(NOW()) - 1, 1)
     GROUP BY YEAR(i.paid_at), MONTH(i.paid_at)`,
    [rate]
  );
  const thisYear = new Date().getFullYear();
  const byMonth = Array.from({ length: 12 }, (_, idx) => ({ month: idx + 1, current: 0, previous: 0 }));
  for (const r of monthly) {
    const slot = byMonth[Number(r.m) - 1];
    if (Number(r.y) === thisYear) slot.current = round2(r.amount);
    else slot.previous = round2(r.amount);
  }

  const [countries] = await pool.query(
    `SELECT i.country, SUM(${usdExpr}) AS amount, COUNT(*) AS payments
     FROM invoices i WHERE ${PAID}
     GROUP BY i.country
     ORDER BY amount DESC
     LIMIT 10`,
    [rate]
  );

  return {
    available: true,
    currency: "USD",
    usdToBdtRate: rate,
    total: round2(s.total),
    month: round2(s.month),
    lastMonth: round2(s.lastMonth),
    year: round2(s.year),
    lastYearToDate: round2(s.lastYearToDate),
    payments: Number(s.payments || 0),
    yearComparison: { currentYear: thisYear, previousYear: thisYear - 1, months: byMonth },
    topCountries: countries.map((c) => ({ country: c.country || null, amount: round2(c.amount), payments: Number(c.payments) })),
  };
}

/** Same shape, all zero — for resellers until reseller checkout exists. */
export function unavailableEarnings(reason) {
  const thisYear = new Date().getFullYear();
  return {
    available: false,
    reason,
    currency: "USD",
    total: 0, month: 0, lastMonth: 0, year: 0, lastYearToDate: 0, payments: 0,
    yearComparison: { currentYear: thisYear, previousYear: thisYear - 1, months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, current: 0, previous: 0 })) },
    topCountries: [],
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────

/** Platform: customer accounts (every workspace except the platform's own). */
export async function getPlatformUserTotals() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(account_type = 'DIRECT_CUSTOMER') AS endUsers,
            SUM(account_type = 'RESELLER') AS resellers,
            SUM(account_type = 'RESELLER_CUSTOMER') AS resellerCustomers,
            SUM(created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) AS thisMonth
     FROM agencies WHERE account_type <> 'PLATFORM'`
  );
  return {
    total: Number(row.total || 0),
    endUsers: Number(row.endUsers || 0),
    resellers: Number(row.resellers || 0),
    resellerCustomers: Number(row.resellerCustomers || 0),
    thisMonth: Number(row.thisMonth || 0),
  };
}

// ─── Subscriber gain (daily, one month) ──────────────────────────────────────

export async function getDailyGain(scope, monthValue) {
  const { year, month, days, key } = parseMonth(monthValue);
  const start = `${key}-01`;
  const where = scope.kind === "workspace" ? "agency_id = ? AND " : "";
  const params = scope.kind === "workspace" ? [scope.agencyId] : [];
  const [rows] = await pool.query(
    `SELECT DAY(created_at) AS d, COUNT(*) AS n
     FROM contacts
     WHERE ${where}source IN (?) AND created_at >= ? AND created_at < ? + INTERVAL 1 MONTH
     GROUP BY DAY(created_at)`,
    [...params, GAIN_SOURCES, start, start]
  );
  const counts = new Map(rows.map((r) => [Number(r.d), Number(r.n)]));
  const series = Array.from({ length: days }, (_, i) => ({ day: i + 1, count: counts.get(i + 1) || 0 }));
  return { month: key, year, monthNumber: month, days, total: series.reduce((a, b) => a + b.count, 0), series };
}

// ─── Automation reports ──────────────────────────────────────────────────────

export async function getAutomationStats(scope) {
  const ws = scope.kind === "workspace";
  const p = ws ? [scope.agencyId] : [];
  const and = (alias) => (ws ? ` AND ${alias}.agency_id = ?` : "");
  const where = (alias) => (ws ? ` WHERE ${alias}.agency_id = ?` : "");

  const [[b]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(b.status = 'COMPLETED') AS completed,
            SUM(b.status IN ('SCHEDULED', 'PROCESSING')) AS upcoming,
            SUM(b.status = 'FAILED') AS failedCampaigns,
            COALESCE(SUM(b.sent_count), 0) AS sent,
            COALESCE(SUM(b.delivered_count), 0) AS delivered,
            COALESCE(SUM(b.failed_count), 0) AS failedMessages
     FROM broadcast_campaigns b${where("b")}`,
    p
  );

  const [[s]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(s.is_active = 1) AS active FROM sequences s${where("s")}`,
    p
  );
  const [[ss]] = await pool.query(
    `SELECT SUM(x.status = 'ACTIVE') AS enrolled, SUM(x.status = 'COMPLETED') AS completed
     FROM sequence_subscribers x JOIN sequences s ON s.id = x.sequence_id${where("s")}`,
    p
  );
  const [[sl]] = await pool.query(
    `SELECT SUM(l.status = 'SENT') AS sent, SUM(l.status = 'FAILED') AS failed
     FROM sequence_subscriber_log l
     JOIN sequence_subscribers x ON x.id = l.subscriber_id
     JOIN sequences s ON s.id = x.sequence_id
     WHERE l.created_at >= NOW() - INTERVAL 30 DAY${and("s")}`,
    p
  );

  const [conns] = await pool.query(
    `SELECT c.platform, COUNT(*) AS total, SUM(c.is_active = 1) AS active
     FROM commerce_connections c${where("c")} GROUP BY c.platform`,
    p
  );
  const [[orders]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(o.created_at >= NOW() - INTERVAL 30 DAY) AS last30
     FROM commerce_orders o JOIN commerce_connections c ON c.id = o.connection_id${where("c")}`,
    p
  );
  const [[hooks]] = await pool.query(
    `SELECT SUM(w.status = 'SUCCESS') AS success, SUM(w.status = 'FAILED') AS failed
     FROM flow_webhook_logs w
     WHERE w.created_at >= NOW() - INTERVAL 30 DAY${and("w")}`,
    p
  );

  const num = (v) => Number(v || 0);
  const conn = (platform) => conns.find((c) => c.platform === platform) || {};
  return {
    broadcasts: {
      total: num(b.total), completed: num(b.completed), upcoming: num(b.upcoming), failedCampaigns: num(b.failedCampaigns),
      sent: num(b.sent), delivered: num(b.delivered), failedMessages: num(b.failedMessages),
    },
    sequences: {
      total: num(s.total), active: num(s.active), enrolled: num(ss.enrolled), completed: num(ss.completed),
      sentLast30: num(sl.sent), failedLast30: num(sl.failed),
    },
    workflows: {
      shopify: { total: num(conn("SHOPIFY").total), active: num(conn("SHOPIFY").active) },
      woocommerce: { total: num(conn("WOOCOMMERCE").total), active: num(conn("WOOCOMMERCE").active) },
      orders: num(orders.total), ordersLast30: num(orders.last30),
      webhookSuccessLast30: num(hooks.success), webhookFailedLast30: num(hooks.failed),
    },
  };
}
