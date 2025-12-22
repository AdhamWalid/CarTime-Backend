// routes/admin.js
const express = require("express");
const Car = require("../models/Car");
const User = require("../models/User");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const UserEvent = require("../models/UserEvent");
const PromoCode = require("../models/PromoCode");
const Invoice = require("../models/invoice");
const mongoose = require("mongoose");
const { requireAuth, requireRole } = require("../middleware/auth");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { Parser } = require("json2csv");
const { buildMonthlyRevenuePdfBuffer } = require("../utils/buildMonthlyRevenuePdf");

// near top of routes/admin.js
const fetch = global.fetch;
// All admin routes require admin login
router.use(requireAuth);
router.use(requireRole("admin"));

/**
 * Helper: log admin actions
 * Usage: await logAdmin(req, { action, targetType, targetId, description, meta });
 */
async function logAdmin(
  req,
  { action, targetType, targetId, description, meta }
) {
  try {
    if (!req.user || !req.user.id) return;

    await ActivityLog.create({
      actor: req.user.id, // 👈 matches ActivityLog schema
      action,
      targetType,
      targetId,
      description,
      meta,
    });
  } catch (err) {
    console.error("ActivityLog error:", err);
  }
}

async function sendExpoNotifications(tokens, { title, body, data }) {
  if (!tokens || tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const t of tokens) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: t,
          sound: "default",
          title,
          body,
          data: data || {},
        }),
      });

      if (!res.ok) {
        console.error("Expo push error:", await res.text());
        failed++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error("Expo push exception:", err);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * GET /api/admin/cars?status=pending
 * List cars with optional status filter
 */

// GET /api/admin/cars/:id
// Detailed view for a single car (any status)
// GET /api/admin/cars/:id
// Detailed single car view
router.get("/cars/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "undefined") {
      return res.status(400).json({ message: "Invalid car id." });
    }

    const car = await Car.findById(id)
      .populate("ownerId", "name email role")
      .lean();

    if (!car) {
      return res.status(404).json({ message: "Car not found." });
    }

    res.json({
      ...car,
      owner: car.ownerId || null,
    });
  } catch (err) {
    console.error("Admin car detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/cars", async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const cars = await Car.find(query).populate("ownerId", "name email");
    res.json(cars);
  } catch (err) {
    console.error("Admin list cars error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/cars/:id/approve
 * Approve a car listing
 */
router.post("/cars/:id/approve", async (req, res) => {
  try {
    const car = await Car.findByIdAndUpdate(
      req.params.id,
      { status: "published" },
      { new: true }
    ).populate("ownerId", "name email");

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    await logAdmin(req, {
      action: "approve_car",
      targetType: "Car",
      targetId: car._id,
      description: `Approved car ${car.title || car._id}`,
      meta: {
        title: car.title,
        plateNumber: car.plateNumber,
        ownerEmail: car.ownerId?.email,
      },
    });

    res.json({ message: "Car approved", car });
  } catch (err) {
    console.error("Approve car error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/cars/:id/unpublish
 * Unpublish / suspend a car
 */
router.post("/cars/:id/unpublish", async (req, res) => {
  try {
    const car = await Car.findById(req.params.id).populate("ownerId", "email");

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    if (car.status !== "published") {
      return res
        .status(400)
        .json({ message: `Car is already ${car.status}, cannot unpublish.` });
    }

    car.status = "suspended";
    await car.save();

    await logAdmin(req, {
      action: "unpublish_car",
      targetType: "Car",
      targetId: car._id,
      description: `Unpublished car ${car.title || car._id}`,
      meta: {
        title: car.title,
        plateNumber: car.plateNumber,
        ownerEmail: car.ownerId?.email,
      },
    });

    res.json(car);
  } catch (err) {
    console.error("Unpublish car error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/admin/bookings
 * Simple bookings list for admin
 */
router.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 }).lean();

    const mapped = bookings.map((b) => ({
      _id: b._id,
      carTitle: b.carTitle,
      carPlate: b.carPlate,
      renterName: "Customer", // can be enhanced later
      status: b.status,
      startDate: b.startDate,
      endDate: b.endDate,
      totalPrice: b.totalPrice,
      contactPhone: b.contactPhone,
    }));

    res.json(mapped);
  } catch (err) {
    console.error("Admin bookings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/admin/analytics
 * Dashboard summary + chart data
 */
router.get("/analytics", async (req, res) => {
  try {
    const [totalCars, totalUsers] = await Promise.all([
      Car.countDocuments(),
      User.countDocuments(),
    ]);

    const totalBookings = await Booking.countDocuments();
    const confirmedBookings = await Booking.countDocuments({
      status: "confirmed",
    });

    // Total revenue
    const revenueAgg = await Booking.aggregate([
      { $match: { status: "confirmed" } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } },
    ]);
    const totalRevenue = revenueAgg[0]?.totalRevenue || 0;

    // This month revenue
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthAgg = await Booking.aggregate([
      {
        $match: {
          status: "confirmed",
          createdAt: { $gte: firstOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          monthRevenue: { $sum: "$totalPrice" },
          monthBookings: { $sum: 1 },
        },
      },
    ]);

    const thisMonthRevenue = monthAgg[0]?.monthRevenue || 0;
    const monthBookings = monthAgg[0]?.monthBookings || 0;

    const daysSince = Math.max(
      1,
      Math.round((now - firstOfMonth) / (1000 * 60 * 60 * 24))
    );
    const avgDailyBookings = monthBookings / daysSince;

    // Last 7 days revenue & bookings
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6);

    const dailyAgg = await Booking.aggregate([
      {
        $match: {
          status: "confirmed",
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          revenue: { $sum: "$totalPrice" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    const dailyRevenue = [];
    const dailyBookings = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(sevenDaysAgo.getDate() + i);

      const yyyy = d.getFullYear();
      const mm = d.getMonth() + 1;
      const dd = d.getDate();

      const label = `${String(dd).padStart(2, "0")}/${String(mm).padStart(
        2,
        "0"
      )}`;

      const found = dailyAgg.find(
        (x) => x._id.year === yyyy && x._id.month === mm && x._id.day === dd
      );

      dailyRevenue.push({ label, amount: found ? found.revenue : 0 });
      dailyBookings.push({ label, count: found ? found.count : 0 });
    }

    res.json({
      totalCars,
      totalUsers,
      totalBookings,
      confirmedBookings,
      totalRevenue,
      thisMonthRevenue,
      avgDailyBookings,
      dailyRevenue,
      dailyBookings,
      topCity: "-",
    });
  } catch (err) {
    console.error("Admin analytics error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== USERS MANAGEMENT ==========

/**
 * GET /api/admin/users
 * List all users for admin panel
 */
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();

    const mapped = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      phoneNumber: u.phoneNumber || "",
      status: u.status || "active",
      createdAt: u.createdAt,
    }));

    res.json(mapped);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * Body: { role: "renter" | "owner" | "admin" }
 */
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await logAdmin(req, {
      action: "change_role",
      targetType: "User",
      targetId: user._id,
      description: `Changed role from ${oldRole} to ${role} for ${user.email}`,
      meta: { from: oldRole, to: role, email: user.email },
    });

    res.json({ message: "Role updated", user });
  } catch (err) {
    console.error("Change role error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Body: { status: "active" | "banned" }
 */
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["active", "banned"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Prevent banning yourself
    if (req.user.id === req.params.id) {
      return res
        .status(400)
        .json({ message: "You cannot change your own status." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const oldStatus = user.status || "active";
    user.status = status;
    await user.save();

    await logAdmin(req, {
      action: "change_user_status",
      targetType: "User",
      targetId: user._id,
      description: `Changed status from ${oldStatus} to ${status} for ${user.email}`,
      meta: { from: oldStatus, to: status, email: user.email },
    });

    res.json({ message: "Status updated", user });
  } catch (err) {
    console.error("Admin update user status error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/admin/owners/:id
 * Owner detail page: user + cars + bookings
 */
router.get("/owners/:id", async (req, res) => {
  try {
    const ownerId = req.params.id;

    const user = await User.findById(ownerId).lean();
    if (!user) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const cars = await Car.find({ ownerId }).lean();

    const carIds = cars.map((c) => c._id);
    const bookings = await Booking.find({ car: { $in: carIds } })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      user,
      cars,
      bookings: bookings.map((b) => ({
        _id: b._id,
        carTitle: b.carTitle,
        carPlate: b.carPlate,
        status: b.status,
        startDate: b.startDate,
        endDate: b.endDate,
        totalPrice: b.totalPrice,
        contactPhone: b.contactPhone,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    console.error("Admin owner detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== ACTIVITY LOGS ==========

/**
 * GET /api/admin/activity?limit=50
 * Global activity feed
 */
router.get("/activity", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);

    const logs = await ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("actor", "name email"); // 👈 match schema

    res.json(
      logs.map((l) => ({
        id: l._id,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        description: l.description,
        meta: l.meta || {},
        createdAt: l.createdAt,
        adminName: l.actor?.name || "Admin",
        adminEmail: l.actor?.email || "",
      }))
    );
  } catch (err) {
    console.error("Admin activity error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/admin/users/:id/activity
 * Activity specifically targeting this user
 */
router.get("/users/:id/activity", async (req, res) => {
  try {
    const userId = req.params.id;

    const logs = await ActivityLog.find({
      targetType: "User",
      targetId: userId,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate("actor", "name email");

    res.json(
      logs.map((l) => ({
        id: l._id,
        action: l.action,
        description: l.description,
        meta: l.meta || {},
        createdAt: l.createdAt,
        adminName: l.actor?.name || "Admin",
        adminEmail: l.actor?.email || "",
      }))
    );
  } catch (err) {
    console.error("User activity error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/admin/events?limit=100
// Global user activity log (non-admin actions)
router.get("/events", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);

    const events = await UserEvent.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email role");

    res.json(
      events.map((e) => ({
        id: e._id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        description: e.description,
        meta: e.meta || {},
        createdAt: e.createdAt,
        userName: e.user?.name || "Unknown user",
        userEmail: e.user?.email || "",
        userRole: e.user?.role || "",
      }))
    );
  } catch (err) {
    console.error("Admin events error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== PROMO CODES MANAGEMENT ==========

// GET /api/admin/promos
router.get("/promos", async (req, res) => {
  try {
    const promos = await PromoCode.find({}).sort({ createdAt: -1 }).lean();

    res.json(
      promos.map((p) => ({
        _id: p._id,
        code: p.code,
        description: p.description || "",
        discountType: p.discountType,
        discountValue: p.discountValue,
        minAmount: p.minAmount || 0,
        maxDiscount: p.maxDiscount || null,
        validFrom: p.validFrom,
        validTo: p.validTo,
        active: p.active,
        usageLimit: p.usageLimit || null,
        usedCount: p.usedCount || 0,
        createdAt: p.createdAt,
      }))
    );
  } catch (err) {
    console.error("Admin promos list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/admin/promos
router.post("/promos", async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minAmount,
      maxDiscount,
      validFrom,
      validTo,
      usageLimit,
    } = req.body;

    if (!code || !discountValue) {
      return res
        .status(400)
        .json({ message: "Code and discount value are required." });
    }

    const existing = await PromoCode.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: "Promo code already exists." });
    }

    const promo = await PromoCode.create({
      code: code.toUpperCase(),
      description: description || "",
      discountType: discountType === "flat" ? "flat" : "percent",
      discountValue,
      minAmount: minAmount || 0,
      maxDiscount: maxDiscount || undefined,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validTo: validTo ? new Date(validTo) : undefined,
      usageLimit: usageLimit || undefined,
      createdBy: req.user.id,
    });

    res.status(201).json(promo);
  } catch (err) {
    console.error("Admin create promo error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/admin/promos/:id/toggle
router.patch("/promos/:id/toggle", async (req, res) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) {
      return res.status(404).json({ message: "Promo code not found." });
    }

    promo.active = !promo.active;
    await promo.save();

    res.json({
      message: "Promo status updated",
      promo,
    });
  } catch (err) {
    console.error("Admin toggle promo error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/admin/notifications/broadcast
// Body: { audience: "all" | "renters" | "owners" | "admins", title, body }
// ========== NOTIFICATIONS ==========
//
// POST /api/admin/notifications/broadcast
// Body: { title, message, audience: "all" | "renters" | "owners", code }
router.post("/notifications/broadcast", async (req, res) => {
  try {
    const { title, message, audience = "all", code } = req.body;

    if (!title || !message || !code) {
      return res.status(400).json({
        message: "Title, message and 2FA code are required.",
      });
    }

    // current admin from JWT (router already uses requireAuth + requireRole("admin"))
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    // 2FA must be enabled
    if (!adminUser.twoFAEnabled || !adminUser.twoFASecret) {
      return res
        .status(400)
        .json({ message: "2FA is not enabled for this admin." });
    }

    // verify 2FA code with speakeasy
    const verified = speakeasy.totp.verify({
      secret: adminUser.twoFASecret,
      encoding: "base32",
      token: code,
      window: 1, // allow minor clock drift
    });

    if (!verified) {
      return res.status(400).json({ message: "Invalid 2FA code." });
    }

    // decide which users to notify based on audience
    const query = {
      expoPushToken: { $exists: true, $ne: null },
    };

    if (audience === "renters") query.role = "renter";
    if (audience === "owners") query.role = "owner";

    const users = await User.find(query).select("expoPushToken role email");
    const tokens = users
      .map((u) => u.expoPushToken)
      .filter((t) => !!t && t.startsWith("ExponentPushToken"));

    if (tokens.length === 0) {
      return res.status(400).json({
        message: "No users with valid push tokens for this audience.",
      });
    }

    // Build Expo push messages
    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      title: title,
      body: message,
      data: {
        type: "broadcast",
        from: "admin",
        audience,
      },
    }));

    // Send to Expo push API
    const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoRes.json();
    console.log("Expo push response:", expoJson);

    // Optional: log this as an admin action
    try {
      await ActivityLog.create({
        actor: adminUser._id,
        action: "broadcast_notification",
        targetType: "Notification",
        targetId: null,
        description: `Broadcast to ${audience} (${tokens.length} devices)`,
        meta: {
          title,
          audience,
          recipients: tokens.length,
        },
      });
    } catch (logErr) {
      console.error("ActivityLog broadcast error:", logErr);
    }

    return res.json({
      message: "Broadcast sent.",
      audience,
      recipients: tokens.length,
      expoResult: expoJson?.data || null,
    });
  } catch (err) {
    console.error("Admin notifications broadcast error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// GET /api/admin/invoices?limit=30&page=1&q=...&status=issued&from=...&to=...
router.get("/invoices", async (req, res) => {
  try {
    const {
      q,
      bookingId,
      userId,
      carId,
      status,
      from,
      to,
      limit = 30,
      page = 1,
    } = req.query;

    const filter = {};

    if (bookingId) filter.booking = bookingId;
    if (userId) filter.user = userId;
    if (carId) filter.car = carId;
    if (status) filter.status = status;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    if (q && String(q).trim()) {
      const r = new RegExp(String(q).trim(), "i");
      filter.$or = [
        { invoiceNumber: r },
        { renterEmail: r },
        { renterName: r },
        { carTitle: r },
        { carPlate: r },
      ];
    }

    const lim = Math.min(100, Number(limit) || 30);
    const pg = Math.max(1, Number(page) || 1);
    const skip = (pg - 1) * lim;

    const [items, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      Invoice.countDocuments(filter),
    ]);

    res.json({ items, total, page: pg, limit: lim });
  } catch (err) {
    console.error("Admin invoices list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/invoices/:id", async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id)
      .populate("user", "name email role")
      .populate("booking")
      .lean();

    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    res.json(inv);
  } catch (err) {
    console.error("Admin invoice detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/invoices/:id/pdf", async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    if (inv?.pdf?.storage !== "gridfs" || !inv?.pdf?.fileId) {
      return res.status(404).json({ message: "PDF not available" });
    }

    const bucket = req.app.locals.gridfsBucket;
    if (!bucket) {
      return res.status(500).json({ message: "GridFS bucket not initialized" });
    }

    // Ensure ObjectId
    const fileId =
      typeof inv.pdf.fileId === "string" ? new mongoose.Types.ObjectId(inv.pdf.fileId) : inv.pdf.fileId;

    res.setHeader("Content-Type", inv.pdf.mime || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${inv.pdf.filename || `CarTime-Invoice-${inv.invoiceNumber}.pdf`}"`
    );

    await logAdmin(req, {
      action: "download_invoice_pdf",
      targetType: "Invoice",
      targetId: inv._id,
      description: `Downloaded invoice PDF ${inv.invoiceNumber}`,
      meta: { invoiceNumber: inv.invoiceNumber, bookingId: inv.booking?.toString?.() },
    });

    bucket.openDownloadStream(fileId).pipe(res);
  } catch (err) {
    console.error("Admin invoice pdf error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// GET /api/admin/invoices/export.csv?q=...&status=...&from=...&to=...
router.get("/invoices/export.csv", async (req, res) => {
  try {
    const { q, bookingId, userId, carId, status, from, to } = req.query;

    const filter = {};
    if (bookingId) filter.booking = bookingId;
    if (userId) filter.user = userId;
    if (carId) filter.car = carId;
    if (status) filter.status = status;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    if (q && String(q).trim()) {
      const r = new RegExp(String(q).trim(), "i");
      filter.$or = [
        { invoiceNumber: r },
        { renterEmail: r },
        { renterName: r },
        { carTitle: r },
        { carPlate: r },
      ];
    }

    const rows = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const fields = [
      { label: "Invoice No", value: "invoiceNumber" },
      { label: "Created At", value: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : "") },
      { label: "Status", value: "status" },

      { label: "Renter Name", value: "renterName" },
      { label: "Renter Email", value: "renterEmail" },
      { label: "Phone", value: "contactPhone" },

      { label: "Car", value: "carTitle" },
      { label: "Plate", value: "carPlate" },
      { label: "Pickup City", value: "pickupCity" },

      { label: "Start Date", value: (r) => (r.startDate ? new Date(r.startDate).toISOString() : "") },
      { label: "End Date", value: (r) => (r.endDate ? new Date(r.endDate).toISOString() : "") },
      { label: "Nights", value: "nights" },

      { label: "Currency", value: "currency" },
      { label: "Subtotal", value: (r) => Number(r.subtotal || 0).toFixed(2) },
      { label: "Discount", value: (r) => Number(r.discount || 0).toFixed(2) },
      { label: "Promo Code", value: "promoCode" },
      { label: "Amount", value: (r) => Number(r.amount || 0).toFixed(2) },

      { label: "Booking ID", value: (r) => String(r.booking || "") },
      { label: "User ID", value: (r) => String(r.user || "") },
      { label: "Car ID", value: (r) => String(r.car || "") },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    const filename = `cartime-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);

    await logAdmin(req, {
      action: "export_invoices_csv",
      targetType: "Invoice",
      targetId: null,
      description: `Exported invoices CSV (${rows.length} rows)`,
      meta: { rows: rows.length, filter },
    });
  } catch (err) {
    console.error("Export invoices CSV error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/reports/revenue-monthly.pdf", async (req, res) => {
  try {
    const month = String(req.query.month || "").trim(); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "month must be YYYY-MM (e.g. 2025-12)" });
    }

    const [yyyy, mm] = month.split("-").map(Number);
    const start = new Date(yyyy, mm - 1, 1);
    const end = new Date(yyyy, mm, 1); // next month

    // Confirmed bookings revenue (recommended)
    const agg = await Booking.aggregate([
      {
        $match: {
          status: "confirmed",
          createdAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
          },
          amount: { $sum: "$totalPrice" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": 1, "_id.m": 1, "_id.d": 1 } },
    ]);

    // Build daily list for all days in month (including zeros)
    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    const dailyRows = [];
    let totalRevenue = 0;
    let totalBookings = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const found = agg.find((x) => x._id.y === yyyy && x._id.m === mm && x._id.d === day);
      const amount = found ? found.amount : 0;
      const count = found ? found.count : 0;

      totalRevenue += amount;
      totalBookings += count;

      dailyRows.push({
        label: `${String(day).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${yyyy}`,
        amount,
        count,
      });
    }

    const totals = {
      totalRevenue,
      confirmedBookings: totalBookings,
      avgRevenuePerDay: totalRevenue / Math.max(1, daysInMonth),
      avgBookingsPerDay: Number((totalBookings / Math.max(1, daysInMonth)).toFixed(2)),
    };

    const monthLabel = start.toLocaleString("en-MY", { month: "long", year: "numeric" });
    const pdf = await buildMonthlyRevenuePdfBuffer({ monthLabel, totals, dailyRows });

    const filename = `cartime-revenue-${month}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);

    await logAdmin(req, {
      action: "export_monthly_revenue_pdf",
      targetType: "Report",
      targetId: null,
      description: `Exported monthly revenue PDF (${month})`,
      meta: { month, totalRevenue, totalBookings },
    });
  } catch (err) {
    console.error("Monthly revenue PDF error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
