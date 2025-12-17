const express = require("express");
const router = express.Router();
const AccountDeletionRequest = require("../models/AccountDeletionRequest");

// POST /api/account-deletion-requests
router.post("/", async (req, res) => {
  try {
    const { email, phone, reason, source } = req.body || {};

    if (!email || !String(email).trim()) {
      return res.status(400).json({ message: "Email is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = phone ? String(phone).trim() : "";
    const cleanReason = reason ? String(reason).trim() : "";
    const cleanSource = source ? String(source).trim() : "website";

    // Optional: block duplicates if pending already exists
    const existing = await AccountDeletionRequest.findOne({
      email: cleanEmail,
      status: "pending",
    });

    if (existing) {
      return res.status(409).json({
        message:
          "You already have a pending deletion request. Our team will contact you soon.",
      });
    }

    const created = await AccountDeletionRequest.create({
      email: cleanEmail,
      phone: cleanPhone,
      reason: cleanReason,
      source: cleanSource,
    });

    return res.status(200).json({
      message:
        "Request submitted successfully. Our team will contact you to verify ownership.",
      id: created._id,
      status: created.status,
    });
  } catch (err) {
    console.log("account deletion request error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;