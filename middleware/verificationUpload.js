const multer = require("multer");
const path = require("path");
const fs = require("fs");

const MAX_MB = 8;
const MAX_SIZE = MAX_MB * 1024 * 1024;

function safeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .slice(0, 80);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id;
    if (!userId) return cb(new Error("No user context"));

    // IMPORTANT: keep this OUTSIDE any public/static folder
    const dir = path.join(process.cwd(), "uploads", "verification", userId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const base = safeName(file.fieldname);
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Unsupported file type"), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

module.exports = { upload };