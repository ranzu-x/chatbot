/** Bot Manager → Groups (WhatsApp Groups API, utils/whatsappGroups.js). */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import {
  createGroup, syncGroups, getGroupDetail, resetInviteLink, deleteGroup,
  removeParticipants, answerJoinRequests, sendGroupText, metaError,
} from "../utils/whatsappGroups.js";

const router = express.Router();
router.use("/wa-groups", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

async function loadIntegration(req, id) {
  const [[row]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'", [id, agencyOf(req)]);
  return row || null;
}
async function loadGroup(req) {
  const [[group]] = await pool.query(
    "SELECT * FROM whatsapp_groups WHERE id = ? AND agency_id = ? AND deleted_at IS NULL", [req.params.groupId, agencyOf(req)]
  );
  if (!group) return {};
  return { group, integration: await loadIntegration(req, group.integration_id) };
}
const fail = (res, err, what) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error(`[WA Groups] ${what}:`, err.response?.data || err.message);
  return res.status(err.response ? 400 : 500).json({ success: false, message: err.response ? metaError(err) : "Server error" });
};

router.get("/wa-groups", async (req, res) => {
  try {
    const integration = await loadIntegration(req, req.query.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    let syncError = null;
    if (req.query.sync === "1") await syncGroups(integration).catch((e) => { syncError = metaError(e); });
    const [groups] = await pool.query(
      `SELECT g.*, (SELECT MAX(created_at) FROM whatsapp_group_messages m WHERE m.group_row_id = g.id) AS last_message_at
         FROM whatsapp_groups g WHERE g.integration_id = ? AND g.deleted_at IS NULL ORDER BY g.created_at DESC`,
      [integration.id]
    );
    return res.json({ success: true, groups, syncError });
  } catch (err) {
    return fail(res, err, "list");
  }
});

router.post("/wa-groups", async (req, res) => {
  try {
    const integration = await loadIntegration(req, req.body?.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    return res.status(201).json({ success: true, ...(await createGroup(integration, req.body || {})) });
  } catch (err) {
    return fail(res, err, "create");
  }
});

router.get("/wa-groups/:groupId", async (req, res) => {
  try {
    const { group, integration } = await loadGroup(req);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    const detail = await getGroupDetail(integration, group);
    const [messages] = await pool.query(
      "SELECT id, direction, sender_id, sender_name, type, body, created_at FROM whatsapp_group_messages WHERE group_row_id = ? ORDER BY id DESC LIMIT 100",
      [group.id]
    );
    return res.json({ success: true, group: { id: group.id, ...detail }, messages: messages.reverse() });
  } catch (err) {
    return fail(res, err, "detail");
  }
});

router.post("/wa-groups/:groupId/invite-link", async (req, res) => {
  try {
    const { group, integration } = await loadGroup(req);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    return res.json({ success: true, inviteLink: await resetInviteLink(integration, group) });
  } catch (err) {
    return fail(res, err, "reset link");
  }
});

router.post("/wa-groups/:groupId/messages", async (req, res) => {
  try {
    const { group, integration } = await loadGroup(req);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    return res.json({ success: true, message: await sendGroupText(integration, group, req.body?.text, req.user.id) });
  } catch (err) {
    return fail(res, err, "send");
  }
});

router.post("/wa-groups/:groupId/participants/remove", async (req, res) => {
  try {
    const { group, integration } = await loadGroup(req);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    await removeParticipants(integration, group, req.body?.users);
    return res.json({ success: true });
  } catch (err) {
    return fail(res, err, "remove participants");
  }
});

router.post("/wa-groups/:groupId/join-requests", async (req, res) => {
  try {
    const { group, integration } = await loadGroup(req);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    return res.json({ success: true, result: await answerJoinRequests(integration, group, req.body?.ids, req.body?.approve !== false) });
  } catch (err) {
    return fail(res, err, "join requests");
  }
});

router.delete("/wa-groups/:groupId", async (req, res) => {
  try {
    const { group, integration } = await loadGroup(req);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    await deleteGroup(integration, group);
    return res.json({ success: true });
  } catch (err) {
    return fail(res, err, "delete");
  }
});

export default router;
