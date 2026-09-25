/**
 * Per-team-member channel (connected account) access + org-membership
 * lookup helpers — shared by routes/team.js (management) and
 * routes/conversations.js (enforcement), per the approved SaaS hierarchy
 * plan (§8/§9).
 *
 * "No restriction rows" means unrestricted (sees every integration their
 * org owns) — this is deliberate: every pre-existing team member starts
 * with zero rows after migrate_saas_hierarchy.js, so nobody loses access
 * on migration day. Restriction only kicks in once an org explicitly picks
 * specific accounts for a member.
 */
import pool from "../db.js";

/** null = unrestricted; otherwise the array of integration_ids this member may access. */
export async function getAccessibleIntegrationIds(organizationMemberId) {
  if (!organizationMemberId) return null;
  const [rows] = await pool.query(
    "SELECT integration_id FROM team_member_integration_access WHERE organization_member_id = ?",
    [organizationMemberId]
  );
  if (!rows.length) return null;
  return rows.map((r) => r.integration_id);
}

export async function setIntegrationAccess(organizationMemberId, integrationIds = []) {
  await pool.query("DELETE FROM team_member_integration_access WHERE organization_member_id = ?", [organizationMemberId]);
  const ids = [...new Set((integrationIds || []).map(Number))].filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return;
  const values = ids.map((id) => [organizationMemberId, id]);
  await pool.query("INSERT INTO team_member_integration_access (organization_member_id, integration_id) VALUES ?", [values]);
}

/**
 * An assignee must belong to this workspace: a team member of it, the account
 * owner, or the caller themself (a platform Admin). Owner/Admin profiles carry
 * no agency_id, so a plain agency_id match would reject them.
 */
export async function isValidAssignee(agentProfileId, agencyId, callerUserId) {
  const [rows] = await pool.query(
    `SELECT ap.id FROM agent_profiles ap
     WHERE ap.id = ?
       AND (ap.agency_id = ?
            OR ap.user_id = (SELECT owner_id FROM agencies WHERE id = ?)
            OR ap.user_id = ?)
     LIMIT 1`,
    [agentProfileId, agencyId, agencyId, callerUserId]
  );
  return rows.length > 0;
}

/** The caller's own organization_members row (id, role_id, chat_access) for their current workspace. */
export async function getOrgMember(userId, agencyId) {
  if (!userId || !agencyId) return null;
  const [rows] = await pool.query(
    "SELECT id, role_id, chat_access, member_kind, is_active FROM organization_members WHERE user_id = ? AND agency_id = ? LIMIT 1",
    [userId, agencyId]
  );
  return rows[0] || null;
}

/**
 * Adds `AND integration_id IN (...)` to a query for a chat-access-scoped
 * caller, if they're restricted. Returns { clause, params } — clause is ''
 * when the caller is unrestricted.
 */
export async function integrationAccessClause(organizationMemberId, integrationColumn = "integration_id") {
  const ids = await getAccessibleIntegrationIds(organizationMemberId);
  const blocked = await getRoleDisabledChannels(organizationMemberId);
  let clause = "";
  const params = [];
  if (ids !== null) {
    if (!ids.length) return { clause: ` AND 1=0`, params: [] }; // restricted with zero grants = sees nothing
    clause += ` AND ${integrationColumn} IN (${ids.map(() => "?").join(",")})`;
    params.push(...ids);
  }
  if (blocked.length) {
    clause += ` AND ${integrationColumn} NOT IN (SELECT id FROM integrations WHERE platform IN (${blocked.map(() => "?").join(",")}))`;
    params.push(...blocked);
  }
  return { clause, params };
}

/**
 * Platforms the member's team role is blocked from ("Disable WhatsApp" etc.
 * on the Team Roles page, roles.disabled_channels). [] = none.
 */
export async function getRoleDisabledChannels(organizationMemberId) {
  if (!organizationMemberId) return [];
  const [rows] = await pool.query(
    `SELECT r.disabled_channels FROM organization_members om
     JOIN roles r ON r.id = om.role_id
     WHERE om.id = ?`,
    [organizationMemberId]
  );
  let list = rows[0]?.disabled_channels;
  try {
    if (typeof list === "string") list = JSON.parse(list);
  } catch {
    list = null;
  }
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}
