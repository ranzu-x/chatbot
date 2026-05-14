import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Super Admin Login
router.post("/superadmin/login", async (req, res) => {
    const { email, password } = req.body;
    

    try {       
        const [rows] = await pool.execute(
            `SELECT 
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.password,
        u.hospital_id,
        h.hospital_name,
        GROUP_CONCAT(DISTINCT r.id) AS role_ids,
        GROUP_CONCAT(DISTINCT r.name) AS roles,
        GROUP_CONCAT(DISTINCT rp.permissions) AS role_permissions
      FROM users u
      LEFT JOIN hospitals h ON u.hospital_id = h.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      WHERE u.email = ?
      GROUP BY u.id
      LIMIT 1`,
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: "Invalid email" });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }

        // Process permissions from all roles
        let allPermissions = {};
        if (user.role_permissions) {
            try {
                const rolePerms = JSON.parse(user.role_permissions);
                Object.keys(rolePerms).forEach(resourceId => {
                    allPermissions[resourceId] = [
                        ...new Set(rolePerms[resourceId])
                    ];
                });
            } catch (e) {
                console.error('Error parsing permissions:', e);
            }
        }

        // Convert resource IDs to names and action IDs to names
        const [resources] = await pool.execute('SELECT id, name FROM resources');
        const [actions] = await pool.execute('SELECT id, name FROM permissions');

        const resourceMap = {};
        const actionMap = {};
        resources.forEach(res => resourceMap[res.id] = res.name);
        actions.forEach(act => actionMap[act.id] = act.name);

        // Convert to frontend-friendly format
        const permissionMap = {};
        Object.keys(allPermissions).forEach(resourceId => {
            const resourceName = resourceMap[resourceId];
            const actionIds = allPermissions[resourceId];
            permissionMap[resourceName] = actionIds.map(actionId => actionMap[actionId]);
        });

        // Create token
        const token = jwt.sign(
            {
                id: user.user_id,
                name: `${user.first_name} ${user.last_name}`,
                email: user.email,
                hospital_id: user.hospital_id,
                hospital_name: user.hospital_name,
                roles: user.roles ? user.roles.split(',') : [],
                permissions: permissionMap, // Now using the new format
            },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: "lax",
            maxAge: 8 * 60 * 60 * 1000, // 8 hours
        });

        res.json({
            message: "Login successful",
            user: {
                id: user.user_id,
                name: `${user.first_name} ${user.last_name}`,
                email: user.email,
                hospital_id: user.hospital_id,
                hospital_name: user.hospital_name,
                roles: user.roles ? user.roles.split(',') : [],
                permissions: permissionMap, // New format
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: "Server error" });
    }
});

// ✅ Check-auth (no changes needed)
router.get("/check-auth", authMiddleWare, (req, res) => {
    res.json({ user: req.user });
});

// ✅ Logout (no changes needed)
router.post("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out" });
});

export default router;