// middleware/requireVerified.js
const Verification = require("../models/Verification");

module.exports = async function requireVerified(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const v = await Verification.findOne({ user: req.user.id })
      .select("status")
      .lean();

    if (!v || v.status !== "approved") {
      return res.status(403).json({
        code: "VERIFICATION_REQUIRED",
        message: "Verification required before booking.",
        status: v?.status || "not_submitted",
      });
    }

    next();
  } catch (err) {
    console.error("requireVerified error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};