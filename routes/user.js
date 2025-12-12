// routes/user.js
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/user/me
 * Return basic info about the logged-in user
 */
router.get("/me", requireAuth, async (req, res) => {
  // pseudo-helper you can call in screens
if (res.status === 403) {
  const data = await res.json();
  if (data.message?.toLowerCase().includes("banned")) {
    Alert.alert("Account banned", data.message, [
      {
        text: "OK",
        onPress: () => logout(), // from AuthContext
      },
    ]);
    return;
  }
}
  try {
    const user = await User.findById(req.user.id).select("_id name email role");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/user/profile
 * Update name and/or password for logged-in user
 */
router.put("/profile", requireAuth, async (req, res) => {
  // pseudo-helper you can call in screens
if (res.status === 403) {
  const data = await res.json();
  if (data.message?.toLowerCase().includes("banned")) {
    Alert.alert("Account banned", data.message, [
      {
        text: "OK",
        onPress: () => logout(), // from AuthContext
      },
    ]);
    return;
  }
}
  try {
    const { name, password } = req.body;

    const update = {};
    if (name && name.trim().length > 0) {
      update.name = name.trim();
    }

    if (password && password.trim().length >= 6) {
      const hashed = await bcrypt.hash(password.trim(), 10);
      update.password = hashed;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true }
    ).select("_id name email role");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
