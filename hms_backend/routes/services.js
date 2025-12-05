import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

router.get("/services", authMiddleWare, async (req, res) => {
  try {
    // We select only the columns the frontend needs: id and service_name.
    // It's good practice to only fetch active services and order them alphabetically.
    const [services] = await pool.query(
      `
      SELECT id, service_name 
      FROM services 
      WHERE is_active = TRUE 
      ORDER BY service_name ASC;
      `
    );

    // Send the list of services back as a JSON response
    res.status(200).json(services);

  } catch (error) {
    console.error("❌ Error fetching services:", error);
    res.status(500).json({ message: "Server error while fetching services." });
  }
});
export default router;