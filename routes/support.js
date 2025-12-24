const express = require("express");
const router = express.Router();
const SupportTicket = require("../models/SupportTicket");

const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));

router.post("/ticket", async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      userType,
      issueType,
      bookingId,
      carId,
      subject,
      message,
      source,
    } = req.body || {};

    // Basic validation
    if (!fullName || !email || !userType || !issueType || !subject || !message) {
      return res.status(400).json({ ok: false, message: "Missing required fields." });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ ok: false, message: "Invalid email address." });
    }
    if (!["Customer", "Car Owner"].includes(userType)) {
      return res.status(400).json({ ok: false, message: "Invalid userType." });
    }

    const ticket = await SupportTicket.create({
      fullName,
      email,
      phone,
      userType,
      issueType,
      bookingId,
      carId,
      subject,
      message,
      source: source || "web-support",
      meta: {
        ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.status(201).json({
      ok: true,
      message: "Ticket created successfully.",
      ticketId: ticket._id,
      status: ticket.status,
    });
  } catch (err) {
    console.error("Support ticket error:", err);
    return res.status(500).json({ ok: false, message: "Server error." });
  }
});

module.exports = router;