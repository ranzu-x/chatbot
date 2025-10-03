// backend/routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

// Hospital Admin Signup with JWT
router.post("/hospital-admin/signup", async (req, res) => {
    const { firstname, lastname, email, password } = req.body;

    try {
        // 1. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. Create hospital

        // Generate a random 6-character alphanumeric code
        function generateHospitalCode(length = 10) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < length; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        }

        const hospitalCode = generateHospitalCode();
        const [hospitalResult] = await pool.query(
            "INSERT INTO hospitals (hospital_name, hospital_code) VALUES (?, ?)",
            [`${firstname}'s Hospital`, hospitalCode]
        );

        const hospitalId = hospitalResult.insertId;

        // 3. Insert user with hospital_id
        const [userResult] = await pool.query(
            "INSERT INTO users (first_name, last_name, email, password, hospital_id) VALUES (?, ?, ?, ?, ?)",
            [firstname, lastname, email, hashedPassword, hospitalId]
        );
        const userId = userResult.insertId;

        // 4. Assign hospital_admin role
        const hospitalAdminRoleId = 2; // assuming role_id=2 is hospital_admin
        await pool.query(
            "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
            [userId, hospitalAdminRoleId]
        );

        // 5. Generate JWT
        const tokenPayload = {
            id: userId,
            firstname,
            lastname,
            role: "hospital_admin",
            hospital_id: hospitalId
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "8h" });

        // 6. Send response
        res.status(201).json({
            message: "Hospital Admin registered successfully",
            user: tokenPayload,
            token
        });

    } catch (error) {
        console.error("Error creating hospital admin:", error);
        res.status(500).json({ message: "Something went wrong" });
    }
});

export default router;
