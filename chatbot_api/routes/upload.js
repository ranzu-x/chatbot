import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/authmiddleware.js";

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    // Allow images, videos, audio, documents
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mp3|wav|ogg|pdf|doc|docx|txt|zip/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    if (allowedTypes.test(ext) || allowedTypes.test(mime)) {
      return cb(null, true);
    }
    cb(new Error("File type not supported"));
  },
});

// ─── POST /upload ─────────────────────────────────────────────────────────────
router.post("/upload", authMiddleware, upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Determine message type based on mimetype
    let type = "DOCUMENT";
    if (req.file.mimetype.startsWith("image/")) {
      type = "IMAGE";
    } else if (req.file.mimetype.startsWith("audio/")) {
      type = "AUDIO";
    } else if (req.file.mimetype.startsWith("video/")) {
      type = "VIDEO";
    }

    return res.json({
      success: true,
      url: fileUrl,
      type,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, message: err.message || "Upload failed" });
  }
});

export default router;
