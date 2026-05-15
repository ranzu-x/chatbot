import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import patientRoutes from "./routes/patients.js";
import medicines from "./routes/medicines.js";
import hospitalAdminSignUpRoutes from "./routes/hospitalAdminSignUp.js";
import usersRoutes from "./routes/users.js";
import appointmentRoutes from "./routes/appointment.js";
import billingRoutes from "./routes/billing.js";
import slotsRoutes from "./routes/slots.js";
import servicesRoutes from "./routes/services.js";
import prescriptionRoutes from "./routes/prescriptions.js";
import superAdminRoutes from "./routes/superadmin.js";
import labRoutes from "./routes/lab.js";
import dashboardRoutes from "./routes/dashboard.js";
import pool from "./db.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
console.log("DB HOST:", process.env.DB_HOST);
// ✅ Middleware
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));
app.use(cookieParser());

try {
  const conn = await pool.getConnection();
  console.log("✅ DB Connected Successfully");
  conn.release();
} catch (err) {
  console.error("❌ DB Connection Failed:", err);
}

// ✅ Routes
app.use('/uploads', express.static('uploads'));  // Serve static files from uploads directory
app.use("/api/v1", authRoutes);
app.use("/api/v1", patientRoutes);
app.use("/api/v1", medicines);
app.use("/api/v1", hospitalAdminSignUpRoutes)
app.use("/api/v1", usersRoutes)
app.use("/api/v1", appointmentRoutes)
app.use("/api/v1", billingRoutes)
app.use("/api/v1", slotsRoutes)
app.use("/api/v1", servicesRoutes);
app.use("/api/v1", prescriptionRoutes);
app.use("/api/v1", superAdminRoutes);
app.use("/api/v1", labRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);


// ✅ Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
