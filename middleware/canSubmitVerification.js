// middleware/canSubmitVerification.js
const Verification = require("../models/Verification");

module.exports = async function canSubmitVerification(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    let v = await Verification.findOne({ user: req.user.id });

    // If no doc yet, create it (still counts as 0 attempts)
    if (!v) {
      v = await Verification.create({ user: req.user.id });
    }

    // cooldown check (optional but you already have it)
    if (v.cooldownUntil && new Date(v.cooldownUntil) > new Date()) {
      return res.status(429).json({
        code: "VERIFICATION_COOLDOWN",
        message: "Please wait before submitting again.",
        cooldownUntil: v.cooldownUntil,
      });
    }

    // If pending or approved => block
    if (v.status === "pending") {
      return res.status(409).json({
        code: "VERIFICATION_ALREADY_PENDING",
        message: "Verification is already submitted and pending review.",
      });
    }

    if (v.status === "approved") {
      return res.status(409).json({
        code: "VERIFICATION_ALREADY_APPROVED",
        message: "Your verification is already approved.",
      });
    }

    // If not_submitted => allow ONLY if attempts === 0
    if (v.status === "not_submitted") {
      if ((v.attempts || 0) >= 1) {
        return res.status(403).json({
          code: "VERIFICATION_SUBMIT_LIMIT",
          message: "You already submitted verification once. Wait for review.",
        });
      }
      req.verification = v;
      return next();
    }

    // If rejected => allow resubmit (your rule)
    if (v.status === "rejected") {
      req.verification = v;
      return next();
    }

    // fallback
    return res.status(403).json({
      code: "VERIFICATION_SUBMIT_BLOCKED",
      message: "Verification submission is not allowed right now.",
      status: v.status,
    });
  } catch (err) {
    console.error("canSubmitVerification error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};