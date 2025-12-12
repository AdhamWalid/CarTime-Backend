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
// 🔴 These must come BEFORE app.use('/api/auth', authRoutes)
app.use(express.json()); // <<<<<< THIS is the important one

// Routes
console.log(chalk.cyan("📦 Routes loaded:"));

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
app.get("/api/health", (req, res) => res.json({ ok: true, app: "CarTime API" }));

const allowedOrigins = [
  "https://car-time-admin.vercel.app",
  "https://car-time-backend.vercel.app",
  "http://localhost:3000",
  "http://localhost:4000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow server-to-server & Postman
      if (!origin) return callback(null, true);

      // allow Vercel preview deployments
      if (origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked for origin: ${origin}`),
        false
      );
    },
    credentials: true,
  })
);

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