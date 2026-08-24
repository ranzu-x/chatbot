import express from 'express';
import pool from '../db.js';
import { authMiddleWare } from '../middleware/authmiddleware.js';

const router = express.Router();

router.get('/stats', authMiddleWare, async (req, res) => {
    const hospital_id = req.user.hospital_id;

    try {
        // 1. Total Patients
        const [[{ totalPatients }]] = await pool.query(
            'SELECT COUNT(*) as totalPatients FROM patients WHERE hospital_id = ?',
            [hospital_id]
        );

        // 2. Active Doctors
        const [[{ totalDoctors }]] = await pool.query(
            "SELECT COUNT(*) as totalDoctors FROM users WHERE hospital_id = ? AND role_name = 'Doctor'",
            [hospital_id]
        );

        // 3. Today's Appointments
        const today = new Date().toISOString().split('T')[0];
        const [[{ todayAppointments }]] = await pool.query(
            'SELECT COUNT(*) as todayAppointments FROM appointments WHERE hospital_id = ? AND appointment_date = ?',
            [hospital_id, today]
        );

        // 4. Revenue Today
        const [[{ todayRevenue }]] = await pool.query(
            'SELECT COALESCE(SUM(grand_total), 0) as todayRevenue FROM billing WHERE hospital_id = ? AND bill_date = ?',
            [hospital_id, today]
        );

        // 5. Appointment Trends (Last 7 Days)
        const [trends] = await pool.query(
            `SELECT 
                DATE_FORMAT(dates.date, '%b %d') as date,
                COALESCE(COUNT(a.id), 0) as count
            FROM (
                SELECT CURDATE() - INTERVAL (a.a + (10 * b.a)) DAY as date
                FROM (SELECT 0 as a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) as a
                CROSS JOIN (SELECT 0 as a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) as b
            ) dates
            LEFT JOIN appointments a ON DATE(a.appointment_date) = dates.date AND a.hospital_id = ?
            WHERE dates.date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
            GROUP BY dates.date
            ORDER BY dates.date ASC`,
            [hospital_id]
        );

        // 6. Service Distribution
        const [distribution] = await pool.query(
            `SELECT bill_type as name, COUNT(*) as value
             FROM billing
             WHERE hospital_id = ?
             GROUP BY bill_type`,
            [hospital_id]
        );

        // 7. Recent Appointments
        const [recentAppointments] = await pool.query(
            `SELECT 
                CONCAT(p.first_name, ' ', p.last_name) as patientName,
                CONCAT(d.first_name, ' ', d.last_name) as doctor,
                a.appointment_time as time,
                a.status
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             JOIN users d ON a.doctor_id = d.id
             WHERE a.hospital_id = ?
             ORDER BY a.appointment_date DESC, a.appointment_time DESC
             LIMIT 5`,
            [hospital_id]
        );

        res.json({
            stats: {
                totalPatients,
                totalDoctors,
                todayAppointments,
                todayRevenue
            },
            trends,
            distribution,
            recentAppointments
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

export default router;
