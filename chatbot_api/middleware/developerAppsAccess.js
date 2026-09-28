import { getMemberPermissionKeys } from "./permissionMiddleware.js";

/**
 * Developer apps (the workspace's own Meta WhatsApp / Messenger+Instagram and
 * TikTok developer-app credentials, Embedded Signup config, standby apps).
 *
 * Only two kinds of workspace run their own apps: the Platform (Super Admin)
 * and a Reseller (utils/appCredentials.js — its customers use the Reseller's
 * app, Direct Customers use the Platform's). So only these may open them:
 *   - the Super Admin,
 *   - the owner of a PLATFORM / RESELLER workspace,
 *   - a team member of one, whose team role has `developer_apps.manage`.
 * End Users, a Reseller's customers and other team members get 403 — for
 * reads too, since these screens hold credentials.
 */
export const DEVELOPER_APPS_PERMISSION = "developer_apps.manage";
const APP_OWNING_TYPES = new Set(["PLATFORM", "RESELLER"]);

export async function canManageDeveloperApps(user, tenant) {
  if (user?.role === "ADMIN") return true;
  if (!APP_OWNING_TYPES.has(tenant?.accountType)) return false;
  if (user?.role === "RESELLER") return true;
  if (user?.role === "USER") {
    const keys = await getMemberPermissionKeys(user.id, tenant.agencyId);
    return Boolean(keys?.has(DEVELOPER_APPS_PERMISSION));
  }
  return false;
}

export async function requireDeveloperApps(req, res, next) {
  try {
    if (await canManageDeveloperApps(req.user, req.tenant)) return next();
    return res.status(403).json({
      success: false,
      code: "DEVELOPER_APPS_FORBIDDEN",
      message: "Meta and TikTok developer apps are managed by the Super Admin and Resellers (or team members they allow).",
    });
  } catch (err) {
    console.error("[Developer apps] access check:", err.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
