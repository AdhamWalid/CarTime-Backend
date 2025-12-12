// backend/routes/push.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

/**
 * POST /api/push/register
 * Body: { token: "ExpoPushToken[xxxx]" }
 */
router.post("/register", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "token is required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { expoPushToken: token },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Push register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;