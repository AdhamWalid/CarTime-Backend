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
const rateLimit = require("express-rate-limit");
const sanitize = require("mongo-sanitize");
const connectDB = require("./db"); // adjust path if you put it elsewhere

const accountDeletionRequestsRoute = require("./routes/accountDeletionRequests");
// 🔴 These must come BEFORE app.use('/api/auth', authRoutes)
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
  "https://www.cartime.my",
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

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(chalk.green.bold("✔ MongoDB connected"));

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