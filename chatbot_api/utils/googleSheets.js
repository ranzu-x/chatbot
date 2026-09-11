/**
 * Google Sheets integration — one connected Google account per agency (OAuth,
 * offline access so we hold a refresh token and can write to the sheet at any
 * later time, not just at connect-time), used as a User Input Flow's optional
 * export destination.
 *
 * Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in
 * .env — see routes/googleSheets.js for the setup instructions surfaced to
 * the user, and migrate_user_input_flow_v2.js for the storage table.
 */
import { google } from "googleapis";
import pool from "../db.js";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function newOAuthClient() {
  if (!isConfigured()) {
    throw new Error(
      "Google Sheets isn't configured yet — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env."
    );
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/** Builds the consent-screen URL to send the agency's browser to. `state` carries the agencyId through the redirect. */
export function getAuthUrl(state) {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token back
    prompt: "consent",      // force re-consent so a refresh_token is issued even on a reconnect
    scope: SCOPES,
    state: String(state),
  });
}

/** Exchanges the OAuth callback's `code` for tokens and stores them for this agency. */
export async function handleOAuthCallback(agencyId, code) {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    email = data.email || null;
  } catch {
    // Non-fatal — connection still works without the display email.
  }

  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
  await pool.query(
    `INSERT INTO google_sheets_connections (agency_id, google_email, access_token, refresh_token, token_expiry)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       google_email = VALUES(google_email),
       access_token = VALUES(access_token),
       refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
       token_expiry = VALUES(token_expiry),
       updated_at = NOW()`,
    [agencyId, email, tokens.access_token || "", tokens.refresh_token || "", expiry]
  );

  return { email };
}

export async function getStatus(agencyId) {
  const [[row]] = await pool.query(
    "SELECT google_email, updated_at FROM google_sheets_connections WHERE agency_id = ?",
    [agencyId]
  );
  return row ? { connected: true, email: row.google_email, connectedAt: row.updated_at } : { connected: false };
}

export async function disconnect(agencyId) {
  await pool.query("DELETE FROM google_sheets_connections WHERE agency_id = ?", [agencyId]);
}

/** Returns an authenticated OAuth2 client for this agency, refreshing the access token if it's expired/near-expiry. */
async function getAuthedClient(agencyId) {
  const [[row]] = await pool.query(
    "SELECT access_token, refresh_token, token_expiry FROM google_sheets_connections WHERE agency_id = ?",
    [agencyId]
  );
  if (!row) throw new Error("No Google account connected for this agency.");

  const client = newOAuthClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : undefined,
  });

  // googleapis auto-refreshes on demand when a refresh_token is set, but we persist
  // the refreshed access_token back so we're not re-hitting the token endpoint on
  // every single call once it does refresh.
  client.on("tokens", async (tokens) => {
    if (!tokens.access_token) return;
    try {
      await pool.query(
        "UPDATE google_sheets_connections SET access_token = ?, token_expiry = ?, updated_at = NOW() WHERE agency_id = ?",
        [tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date) : null, agencyId]
      );
    } catch {
      // Non-fatal — worst case we refresh again next call.
    }
  });

  return client;
}

/** Lists the connected account's Google Sheets (Drive API), for the Start node's spreadsheet picker. */
export async function listSpreadsheets(agencyId) {
  const auth = await getAuthedClient(agencyId);
  const drive = google.drive({ version: "v3", auth });
  const { data } = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
  });
  return data.files || [];
}

/** Lists a spreadsheet's tab names (Sheets API), for the Start node's tab picker. */
export async function listTabs(agencyId, spreadsheetId) {
  const auth = await getAuthedClient(agencyId);
  const sheets = google.sheets({ version: "v4", auth });
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  return (data.sheets || []).map((s) => ({ id: s.properties.sheetId, title: s.properties.title }));
}

/**
 * Reads every populated cell of one tab (Sheets API) — used by the AI Agent
 * "Google Sheet" knowledge source (utils/aiKnowledge.js) to turn a sheet
 * into indexable text, formatted as one line per row with the header row's
 * labels attached to each value (reads far better as knowledge-base prose
 * than a raw CSV dump would).
 */
export async function readSheetValues(agencyId, spreadsheetId, sheetName) {
  const auth = await getAuthedClient(agencyId);
  const sheets = google.sheets({ version: "v4", auth });
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName ? `${sheetName}` : undefined,
  });
  return data.values || [];
}

/** Appends one row of values to the given spreadsheet/tab. */
export async function appendRow(agencyId, spreadsheetId, sheetName, values) {
  const auth = await getAuthedClient(agencyId);
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

export { isConfigured };
