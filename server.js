// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const chalk = require("chalk");
const authRoutes = require("./routes/auth");
const ownerRoutes = require("./routes/owner"); // 👈 add this
const adminRoutes = require("./routes/admin");
const publicCarRoutes = require("./routes/cars");
const userRoutes = require("./routes/user");
const app = express();
const bookingRoutes = require("./routes/bookings");
const pushRoutes = require("./routes/push");
const promoRoutes = require("./routes/promos");
const helmet = require("helmet");
const walletRoutes = require("./routes/wallet");
const supportRoutes = require("./routes/support");
const verificationRoutes = require("./routes/verification"); // ✅ your file
const path = require("path");
const fs = require("fs");
const User = require("./models/User"); // adjust path if needed
const { requireAuth, requireRole } = require("./middleware/auth");
const { upload } = require("./middleware/verificationUpload");
const rateLimit = require("express-rate-limit");
const sanitize = require("mongo-sanitize");
const connectDB = require("./db"); // adjust path if you put it elsewhere

const accountDeletionRequestsRoute = require("./routes/accountDeletionRequests");
// 🔴 These must come BEFORE app.use('/api/auth', authRoutes)
app.set("trust proxy", 1);

app.use(express.json()); // <<<<<< THIS is the important one
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);


app.use((req, res, next) => {
  if (req.body) req.body = sanitize(req.body);
  if (req.params) req.params = sanitize(req.params);

  // DON’T reassign req.query (getter-only in your case)
  // If you need query sanitization, sanitize into a new object:
  if (req.query) req.sanitizedQuery = sanitize({ ...req.query });

  next();
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 1000,               // per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // login/register attempts
  message: {
    error: "Too many attempts, please try again later.",
  },
});


const allowedOrigins = [
  "https://api.cartime.my",
  "https://cartime.my",
  "https://admin.cartime.my",
  "https://www.cartime.my",
  "https://cartime.my",
  "https://admin.cartime.my",
  "http://localhost:3000",
  "http://localhost:4000",
];

app.use(
  cors({
origin: function (origin, callback) {
  if (!origin) return callback(null, true); // Postman/server-to-server

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked for origin: ${origin}`), false);
},
    credentials: true,
  })
);

function toFileObj(file, key) {
  if (!file) return null;
  return {
    key,                             // REQUIRED by schema
    filename: file.filename,         // stored name on disk
    originalName: file.originalname || "",
    mime: file.mimetype || "",
    size: file.size || 0,
    // IMPORTANT: store a RELATIVE path (not absolute) so it works on server
    path: file.path.replace(process.cwd(), "").replaceAll("\\", "/"),
  };
}

app.post(
  "/api/verification/upload",
  requireAuth,
  upload.fields([
    { name: "drivingLicenseFront", maxCount: 1 },
    { name: "drivingLicenseBack", maxCount: 1 },
    { name: "passport", maxCount: 1 },
    { name: "mykadFront", maxCount: 1 },
    { name: "mykadBack", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (req.user?.role === "guest") {
        return res.status(403).json({ message: "Guests cannot upload documents." });
      }

      const files = req.files || {};
      const one = (k) => files?.[k]?.[0] || null;

      const dlFront = one("drivingLicenseFront");
      const dlBack  = one("drivingLicenseBack");

      if (!dlFront || !dlBack) {
        return res.status(400).json({ message: "Driving license front and back are required." });
      }

      // upsert verification doc for this user
      const doc = await Verification.findOneAndUpdate(
        { user: req.user.id },
        { $setOnInsert: { user: req.user.id } },
        { new: true, upsert: true }
      );

      // abuse rules (same as you wanted)
      if (doc.status === "pending") return res.status(400).json({ message: "Your verification is already under review." });
      if (doc.status === "approved") return res.status(400).json({ message: "You are already verified." });

      // decide idType based on what they submitted
      const hasPassport = !!one("passport");
      const hasMykad = !!one("mykadFront") || !!one("mykadBack");

      doc.idType = hasPassport ? "passport" : hasMykad ? "mykad" : "none";

      // set status + attempts
      doc.status = "pending";
      doc.note = "";
      doc.submittedAt = new Date();
      doc.lastSubmitAt = new Date();
      doc.attempts = (doc.attempts || 0) + 1;

      // ✅ store FileSchema objects
      doc.files.licenseFront = toFileObj(dlFront, "licenseFront");
      doc.files.licenseBack  = toFileObj(dlBack, "licenseBack");

      const passport = one("passport");
      const mykadFront = one("mykadFront");
      const mykadBack = one("mykadBack");

      if (passport) doc.files.passport = toFileObj(passport, "passport");
      if (mykadFront) doc.files.mykadFront = toFileObj(mykadFront, "mykadFront");
      if (mykadBack) doc.files.mykadBack = toFileObj(mykadBack, "mykadBack");

      await doc.save();

      return res.json({
        message: "Documents uploaded. Verification is now pending review.",
        verification: doc,
      });
    } catch (err) {
      console.error("verification upload error:", err);
      return res.status(400).json({ message: err.message || "Upload failed." });
    }
  }
);

// Routes
console.log(chalk.cyan("📦 Routes loaded:"));
app.use("/api/account-deletion-requests", accountDeletionRequestsRoute);
console.log(chalk.gray("• /api/account-deletion-requests"));
app.use("/api/auth", authLimiter);
app.use("/api/auth", authRoutes);
console.log(chalk.gray("• /api/auth"));
app.use("/api/owner", ownerRoutes);
console.log(chalk.gray("• /api/owner"));
app.use("/api/admin", adminRoutes);
console.log(chalk.gray("• /api/admin"));
app.use("/api/cars", publicCarRoutes);
console.log(chalk.gray("• /api/cars"));
app.use("/api/user", userRoutes);
console.log(chalk.gray("• /api/user"));
app.use("/api/bookings", bookingRoutes);
console.log(chalk.gray("• /api/bookings"));
app.use("/api/push", pushRoutes);
console.log(chalk.gray("• /api/push"));
app.use("/api/promos", promoRoutes);
console.log(chalk.gray("• /api/promos"));
app.use("/api/wallet", walletRoutes);
console.log(chalk.gray("• /api/wallet"));
app.use("/api/support", supportRoutes);
console.log(chalk.gray("• /api/support"));

app.use("/api/verification", verificationRoutes);
console.log(chalk.gray("• /api/verification"));

app.get("/", (req, res) => {
  res.send("API running...");
});

app.get("/api/health", async (req, res) => {
  let dbOk = false;

  try {
    await connectDB();

    // Ping admin database (safe, no data leaked)
    await mongoose.connection.db.admin().ping();

    dbOk = true;
  } catch (e) {
    dbOk = false;
  }

  return res.status(dbOk ? 200 : 503).json({
    ok: true,
    db: {
      ok: dbOk,
      status: dbOk ? "connected" : "unreachable",
    },
    time: new Date().toISOString(),
  });
});


app.use((err, req, res, next) => {
  console.error(chalk.red("❌ Error:"), err.message);

  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ error: "Internal server error" });
  }

  res.status(500).json({
    error: err.message,
    stack: err.stack,
  });
});


// ... your middleware, routes, etc.

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(chalk.green.bold("✔ MongoDB connected"));

    // ✅ Init GridFS bucket
    const db = mongoose.connection.db; // native driver Db
    app.locals.gridfsBucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "invoices", // collection will be invoices.files / invoices.chunks
    });

    console.log(chalk.green("✔ GridFS bucket ready: invoices"));

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(
        chalk.blue.bold("🚗 CarTime API running"),
        chalk.white("on"),
        chalk.yellow.bold(`PORT ${PORT}`)
      );
    });
  })
  .catch((err) => {
    console.error(
      chalk.red.bold("✖ MongoDB connection error"),
      chalk.red(err.message)
    );
  });