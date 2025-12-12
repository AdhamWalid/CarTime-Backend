// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

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
app.use(cors());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cars", publicCarRoutes);
app.use("/api/user", userRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/promos", promoRoutes);

app.get("/", (req, res) => {
  res.send("API running...");
});
app.get("/api/health", (req, res) => res.json({ ok: true, app: "CarTime API" }));

//Allowed Origins for CORS
const allowedOrigins = [
  "http://localhost:5000",
  "https://cartime-frontend.onrender.com",
  "https://cartime-api.onrender.com",
  "http://192.168.8.119:4000",
  "http://192.168.8.119:3000",
  "http://localhost:3000",
  "http://172.20.10.2",
  "http://192.168.8.119:5000",
  "http://192.168.8.117",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT, () =>
      console.log(`Server running on port ${process.env.PORT}`)
    );
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
