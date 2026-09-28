/** Bot Manager → Number & Username (WhatsApp): health + business username (utils/whatsappNumber.js). */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { getNumberHealth, setUsername, deleteUsername } from "../utils/whatsappNumber.js";

const router = express.Router();
router.use("/wa-number", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;
async function load(req) {
  const [[row]] = await pool.query(
    "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
    [req.params.integrationId, agencyOf(req)]
  );
  return row || null;
}
const fail = (res, err, fallback) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  const msg = err.response?.data?.error?.message || fallback;
  console.error(fallback, err.response?.data || err.message);
  return res.status(502).json({ success: false, message: msg });
};

router.get("/wa-number/:integrationId", async (req, res) => {
  try {
    const integration = await load(req);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    return res.json({ success: true, health: await getNumberHealth(integration) });
  } catch (err) {
    return fail(res, err, "Could not read the number from Meta");
  }
});

router.put("/wa-number/:integrationId/username", async (req, res) => {
  try {
    const integration = await load(req);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    await setUsername(integration, req.body?.username, { forceTransfer: Boolean(req.body?.forceTransfer) });
    return res.json({ success: true, health: await getNumberHealth(integration) });
  } catch (err) {
    return fail(res, err, "Could not set the username");
  }
});

router.delete("/wa-number/:integrationId/username", async (req, res) => {
  try {
    const integration = await load(req);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    await deleteUsername(integration);
    return res.json({ success: true });
  } catch (err) {
    return fail(res, err, "Could not remove the username");
  }
});

export default router;
