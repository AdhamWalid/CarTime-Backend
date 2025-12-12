// backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided." });
    }

    const token = header.split("Bearer ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔍 Always fetch the latest user from DB
    const user = await User.findById(decoded.userId).select(
      "role status name email phoneNumber"
    );

    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    // 🚫 Block banned users on every protected endpoint
    if (user.status === "banned") {
      return res
        .status(403)
        .json({ message: "Your account has been banned. Contact support." });
    }

    // Attach user info to req
    req.user = {
      id: user._id.toString(),
      role: user.role,
      status: user.status,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Forbidden: insufficient permissions." });
    }
    next();
  };
};

