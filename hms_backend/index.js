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
import billingRoutes from "./routes/billing.js"

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// ✅ Middleware
app.use(express.json());
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));
app.use(cookieParser());

// ✅ Routes
app.use('/uploads', express.static('uploads'));  // Serve static files from uploads directory
app.use("/api/v1", authRoutes);
app.use("/api/v1", patientRoutes);
app.use("/api/v1", medicines);
app.use("/api/v1", hospitalAdminSignUpRoutes)
app.use("/api/v1", usersRoutes)
app.use("/api/v1", appointmentRoutes)
app.use("/api/v1", billingRoutes)

// ✅ Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
