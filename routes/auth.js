// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const appleSignin = require("apple-signin-auth");
const User = require("../models/User");
const UserEvent = require("../models/UserEvent");
const { requireAuth } = require("../middleware/auth");
const EmailVerification = require("../models/EmailVerification");
const { sendVerificationEmail } = require("../utils/sendEmail");
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const sendEmail = require("../utils/sendEmail");

// Helper: sign a normal auth token
function signAuthToken(user) {
  return jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: sign a short-lived 2FA temp token
function signTwoFATempToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, stage: "2fa" },
    JWT_SECRET,
    { expiresIn: "5m" }
  );
}

// ================== REGISTER ==================

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phoneNumber, role } = req.body;
    console.log("REGISTER BODY:", req.body);

    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await EmailVerification.deleteMany({ email });

    await EmailVerification.create({
      email,
      code,
      name,
      hashedPassword,
      phoneNumber,
      role: role === "owner" ? "owner" : "renter",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await sendEmail({
      to: email,
      subject: "Verify your Cartime account",
      html: `
        <p>Hi ${name || "there"},</p>
        <p>Your Cartime verification code is:</p>
        <h2 style="letter-spacing:4px;">${code}</h2>
        <p>This code will expire in 15 minutes.</p>
      `,
    });

    return res.json({
      message: "Verification code sent to your email.",
      email,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// NOTE: You already have /register and /register-start.
// If both exist in production, keep only one flow to avoid confusion.
router.post("/register-start", async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await EmailVerification.findOneAndUpdate(
      { email },
      {
        email,
        name,
        phoneNumber,
        passwordHash,
        code,
        expiresAt,
      },
      { upsert: true, new: true }
    );

    try {
      await sendVerificationEmail(email, code);
      console.log("Verification email sent to:", email);
    } catch (mailErr) {
      console.error("Error sending verification email:", mailErr);
      return res
        .status(500)
        .json({ message: "Failed to send verification email." });
    }

    return res.status(200).json({
      message: "Verification code sent to your email.",
    });
  } catch (err) {
    console.error("Register-start error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/register-complete
router.post("/register-complete", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required." });
    }

    const record = await EmailVerification.findOne({ email });
    if (!record) {
      return res
        .status(400)
        .json({ message: "No verification request found for this email." });
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      return res
        .status(400)
        .json({ message: "Verification code expired. Please try again." });
    }

    if (record.code !== code) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Email already registered. Try logging in." });
    }

    const user = await User.create({
      name: record.name,
      email: record.email,
      phoneNumber: record.phoneNumber,
      password: record.passwordHash || record.hashedPassword,
      role: record.role || "renter",
      emailVerified: true,
    });

    await EmailVerification.deleteOne({ _id: record._id });

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (err) {
    console.error("Register-complete error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ================== NORMAL LOGIN (MOBILE / APP) ==================

router.post("/login", async (req, res) => {
  try {
    const { email, password, expoPushToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    if (user.status === "banned") {
      return res
        .status(403)
        .json({ message: "Your account has been banned. Contact support." });
    }

    if (expoPushToken && expoPushToken !== user.expoPushToken) {
      user.expoPushToken = expoPushToken;
      await user.save();
    }

    const token = signAuthToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        expoPushToken: user.expoPushToken || null,
        isEmailVerified: user.isEmailVerified || false,
        isPhoneVerified: user.isPhoneVerified || false,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== FORGOT PASSWORD + RESET PASSWORD ==================

// POST /api/auth/forgot-password
// Always returns 200 to avoid email enumeration
router.post("/forgot-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  // Return ok no matter what (avoid enumeration)
  // res.status(200).json({ ok: true });

  try {
    if (!email) return;

    const user = await User.findOne({ email });
    if (!user) return;

    // Generate reset token (raw) + store SHA256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
    await user.save();

    // Link on your domain
    const base = process.env.RESET_PASSWORD_BASE_URL ;
    const resetUrl = `${base}/reset-password?token=${rawToken}`;
    console.log(user)
    console.log(user.email)
    await sendEmail({
      to: user.email,
      subject: "Reset your Cartime password",
      html: `
        <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 16px;">
          <h2 style="margin:0 0 8px;">Reset your password</h2>
          <p style="margin:0 0 16px; color:#555;">
            We received a request to reset your Cartime password.
          </p>
          <a href="${resetUrl}" style="
            display:inline-block;
            background:#000;
            color:#fff;
            padding:12px 16px;
            border-radius:12px;
            text-decoration:none;
            font-weight:700;
          ">Reset Password</a>
          <p style="margin-top:16px; font-size:12px; color:#666;">
            This link expires in 30 minutes. If you didn’t request this, you can ignore this email.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Forgot-password error:", err);
  }
});

// POST /api/auth/reset-password
// Body: { token, newPassword }
router.post("/reset-password", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!token || newPassword.length < 8) {
      return res.status(400).json({ message: "Invalid request." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Reset link is invalid or expired." });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return res.json({ ok: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("Reset-password error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ================== ADMIN LOGIN WITH 2FA ==================

router.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required." });
    }

    const user = await User.findOne({ email });
    if (!user || user.role !== "admin") {
      return res.status(400).json({ message: "Invalid admin credentials." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid admin credentials." });
    }

    if (user.status === "banned") {
      return res
        .status(403)
        .json({ message: "Your account has been banned. Contact support." });
    }

    if (!user.twoFAEnabled || !user.twoFASecret) {
      const token = signAuthToken(user);
      return res.json({
        requires2FA: false,
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    }

    const tempToken = signTwoFATempToken(user);
    return res.json({
      requires2FA: true,
      tempToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/admin-login-2fa", async (req, res) => {
  try {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
      return res.status(400).json({ message: "2FA code required." });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, JWT_SECRET);
    } catch (err) {
      return res
        .status(401)
        .json({ message: "2FA session expired. Try again." });
    }

    if (payload.stage !== "2fa" || !payload.userId) {
      return res.status(400).json({ message: "Invalid 2FA session." });
    }

    const user = await User.findById(payload.userId);
    if (!user || user.role !== "admin") {
      return res.status(400).json({ message: "Invalid admin account." });
    }

    if (!user.twoFAEnabled || !user.twoFASecret) {
      return res
        .status(400)
        .json({ message: "2FA not enabled for this admin." });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ message: "Invalid 2FA code." });
    }

    const token = signAuthToken(user);

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Admin 2FA verify error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== ADMIN 2FA SETUP (ENABLE) ==================

router.post("/admin/2fa/setup", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    const secret = speakeasy.generateSecret({
      name: `Cartime Admin (${user.email})`,
    });

    user.twoFASecret = secret.base32;
    user.twoFAEnabled = false;
    await user.save();

    const otpauthUrl = secret.otpauth_url;
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    res.json({
      qrCodeDataUrl,
      secret: secret.base32,
    });
  } catch (err) {
    console.error("Admin 2FA setup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/admin/2fa/confirm", requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "2FA code is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    if (!user.twoFASecret) {
      return res.status(400).json({ message: "2FA secret not initialized." });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ message: "Invalid 2FA code." });
    }

    user.twoFAEnabled = true;
    user.twoFAConfirmedAt = new Date();
    await user.save();

    res.json({ message: "2FA enabled successfully." });
  } catch (err) {
    console.error("Admin 2FA confirm error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/admin/2fa/disable", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    user.twoFAEnabled = false;
    user.twoFASecret = undefined;
    user.twoFAConfirmedAt = undefined;
    await user.save();

    res.json({ message: "2FA disabled successfully." });
  } catch (err) {
    console.error("Admin 2FA disable error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== GET CURRENT USER ==================

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      phoneNumber: user.phoneNumber,
      twoFAEnabled: user.twoFAEnabled || false,
    });
  } catch (err) {
    console.error("GET /auth/me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== EMAIL RESEND + VERIFY ==================

router.post("/email/resend", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No user found with this email." });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    await EmailVerification.create({
      email,
      code,
      createdAt: new Date(),
    });

    await sendEmail({
      to: email,
      subject: "Verify your Cartime email",
      html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px;">
        <h2 style="margin-bottom: 8px;">Verify your email</h2>
        <p style="margin-bottom: 16px;">
          Use the following code to complete your Cartime registration:
        </p>
        <div style="
          display:inline-block;
          padding: 12px 20px;
          border-radius: 999px;
          background:#000;
          color:#fff;
          font-size:20px;
          font-weight:700;
          letter-spacing:0.3em;
        ">
          ${code}
        </div>
        <p style="margin-top:16px; font-size:13px; color:#555;">
          This code will expire in 15 minutes. If you didn’t request this, you can ignore this email.
        </p>
      </div>
    `,
    });

    res.json({ message: "Verification code resent to your email." });
  } catch (err) {
    console.error("Email resend error:", err);
    res.status(500).json({ message: "Server error while resending code." });
  }
});

router.post("/email/verify", async (req, res) => {
  try {
    console.log("VERIFY BODY:", req.body);
    const { email, code } = req.body;

    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required." });
    }

    const record = await EmailVerification.findOne({ email })
      .sort({ createdAt: -1 })
      .exec();

    if (!record) {
      return res
        .status(400)
        .json({ message: "No verification request found for this email." });
    }

    if (record.createdAt) {
      const expiresAt = new Date(record.createdAt.getTime() + 15 * 60 * 1000);
      if (Date.now() > expiresAt.getTime()) {
        return res.status(400).json({ message: "Verification code has expired." });
      }
    }

    if (record.code !== code.trim()) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    let user = await User.findOne({ email });

    if (!user) {
      const hashed = record.hashedPassword || record.passwordHash;
      if (!hashed) {
        return res.status(500).json({
          message:
            "Verification data incomplete. Please register again to receive a new code.",
        });
      }

      user = await User.create({
        name: record.name || email.split("@")[0],
        email,
        password: hashed,
        phoneNumber: record.phoneNumber,
        role: record.role || "renter",
        emailVerified: true,
      });
    } else {
      user.emailVerified = true;
      await user.save();
    }

    await EmailVerification.deleteMany({ email });

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Email verified successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error("Email verify error:", err);
    res
      .status(500)
      .json({ message: "Server error during email verification." });
  }
});

// ================== SOCIAL LOGIN ==================

router.post("/social/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google ID token required." });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleUserId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split("@")[0];

    if (!email) {
      return res
        .status(400)
        .json({ message: "Google account has no accessible email." });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        password: null,
        phoneNumber: "",
        role: "renter",
        status: "active",
        emailVerified: true,
        authProvider: "google",
        providerId: googleUserId,
      });
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    const needsPhoneNumber = !user.phoneNumber;

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
      },
      needsPhoneNumber,
    });
  } catch (err) {
    console.error("Google social login error:", err);
    res.status(500).json({ message: "Google login failed." });
  }
});

router.post("/social/apple", async (req, res) => {
  try {
    const { identityToken } = req.body;
    if (!identityToken) {
      return res
        .status(400)
        .json({ message: "Apple identity token is required." });
    }

    let decoded;
    try {
      decoded = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_CLIENT_ID,
      });
    } catch (e) {
      console.error("Apple token verify error:", e);
      return res.status(400).json({ message: "Invalid Apple token." });
    }

    const appleUserId = decoded.sub;
    const email = decoded.email;
    const name = decoded.email?.split("@")[0] || "Apple User";

    if (!email) {
      return res.status(400).json({
        message:
          "Apple did not return an email. Please use normal login or another method.",
      });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        password: null,
        phoneNumber: "",
        role: "renter",
        status: "active",
        emailVerified: true,
        authProvider: "apple",
        providerId: appleUserId,
      });
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    const needsPhoneNumber = !user.phoneNumber;

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
      },
      needsPhoneNumber,
    });
  } catch (err) {
    console.error("Apple social login error:", err);
    res.status(500).json({ message: "Apple login failed." });
  }
});

// Update phone for social users
router.post("/phone", requireAuth, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || phoneNumber.trim().length < 5) {
      return res.status(400).json({ message: "Valid phone number is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.phoneNumber = phoneNumber.trim();
    await user.save();

    res.json({
      message: "Phone number updated.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error("Update phone error:", err);
    res.status(500).json({ message: "Server error updating phone number." });
  }
});

module.exports = router;