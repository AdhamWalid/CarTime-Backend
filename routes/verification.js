// routes/verification.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Verification = require("../models/Verification");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * IMPORTANT SECURITY NOTE:
 * - DO NOT expose uploads folder using express.static()
 * - Files are only downloadable via admin-protected routes (we’ll add those next)
 */

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// store under: <projectRoot>/private_uploads/verifications/<userId>/
const ROOT_DIR = path.join(process.cwd(), "private_uploads", "verifications");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id;
    const dir = path.join(ROOT_DIR, String(userId || "unknown"));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safeOrig = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}-${safeOrig}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/jpg", "application/pdf"].includes(file.mimetype);
    if (!ok) return cb(new Error("Only JPG/PNG/PDF allowed"));
    cb(null, true);
  },
});

// all verification routes require login
router.use(requireAuth);

/**
 * GET /api/verification/me
 * returns current verification status + what files exist (no file urls)
 */
router.get("/me", async (req, res) => {
  try {
    const v = await Verification.findOne({ user: req.user.id }).lean();

    if (!v) {
      return res.json({
        status: "not_submitted",
        idType: "none",
        files: {},
        note: "",
        submittedAt: null,
        decidedAt: null,
      });
    }

    const present = {};
    for (const k of ["licenseFront","licenseBack","mykadFront","mykadBack","passport"]) {
      present[k] = !!v.files?.[k];
    }

    res.json({
      status: v.status,
      idType: v.idType,
      files: present,
      note: v.note || "",
      submittedAt: v.submittedAt,
      decidedAt: v.decidedAt,
    });
  } catch (err) {
    console.error("verification me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/verification/submit
 * multipart/form-data fields:
 *  - idType: "passport" | "mykad"
 * files:
 *  - licenseFront (required)
 *  - licenseBack (required)
 *  - passport (required if idType=passport)
 *  - mykadFront + mykadBack (required if idType=mykad)
 */
router.post(
  "/submit",
  requireAuth,
  upload.fields([
    { name: "licenseFront", maxCount: 1 },
    { name: "licenseBack", maxCount: 1 },
    { name: "mykadFront", maxCount: 1 },
    { name: "mykadBack", maxCount: 1 },
    { name: "passport", maxCount: 1 },
  ]),
  async (req, res) => {
    const userId = req.user.id;

    let doc = await Verification.findOne({ user: userId });
    if (!doc) doc = await Verification.create({ user: userId });

    if (doc.status === "pending") {
      return res.status(400).json({ message: "Your verification is already under review." });
    }
    if (doc.status === "approved") {
      return res.status(400).json({ message: "You are already verified." });
    }

    const MAX_ATTEMPTS = 3;
    if ((doc.attempts || 0) >= MAX_ATTEMPTS) {
      return res.status(400).json({ message: "Too many attempts. Contact support." });
    }

const pick = (key) => {
  const f = req.files?.[key]?.[0];
  if (!f) return null;

  const relPath = path.posix.join("verifications", String(userId), f.filename);

  return {
    key,
    filename: f.filename,
    originalName: f.originalname,
    mime: f.mimetype,
    size: f.size,
    path: relPath,        // ✅ REQUIRED by your schema
    relPath: relPath,     // (optional) keep if you want
  };
};

    doc.status = "pending";
    doc.note = "";
    doc.submittedAt = new Date();
    doc.lastSubmitAt = new Date();
    doc.attempts = (doc.attempts || 0) + 1;

    doc.files = {
      licenseFront: pick("licenseFront"),
      licenseBack: pick("licenseBack"),
      mykadFront: pick("mykadFront"),
      mykadBack: pick("mykadBack"),
      passport: pick("passport"),
    };

    await doc.save();

    res.json({ message: "Submitted for review", verification: doc });
  }
);
/* ----------------------------
   DELETE /api/verification/clear
   (optional) user clears their submission and re-uploads
----------------------------- */
router.delete("/clear", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("verification");
    if (!user) return res.status(404).json({ message: "User not found" });

    user.verification = {
      status: "not_submitted",
      note: "",
      submittedAt: null,
      reviewedAt: null,
      documents: {
        drivingLicenseFront: "",
        drivingLicenseBack: "",
        passport: "",
        mykadFront: "",
        mykadBack: "",
      },
    };

    await user.save();
    res.json({ message: "Verification cleared." });
  } catch (err) {
    console.error("verification clear error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;