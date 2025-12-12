// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
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
// ================== REGISTER (STEP 1 – SEND CODE, NO USER YET) ==================

// POST /api/auth/register-start
// routes/auth.js  (REGISTER)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phoneNumber, role } = req.body;
    console.log("REGISTER BODY:", req.body);

    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // 1) Make sure no real user already exists with this email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    // 2) Hash password now
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3) Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 4) Clear old pending verifications for this email
    await EmailVerification.deleteMany({ email });

    // 5) Save pending registration
    await EmailVerification.create({
      email,
      code,
      name,
      hashedPassword,
      phoneNumber,
      role: role === "owner" ? "owner" : "renter",
    });

    // 6) Send email with code
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

    // 7) DO NOT create user yet, DO NOT return token
    return res.json({
      message: "Verification code sent to your email.",
      email, // so frontend can pass it to VerifyEmail screen
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

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
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

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

    // 🔥 REAL EMAIL SENDING
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

// ================== REGISTER (STEP 2 – VERIFY CODE & CREATE USER) ==================

// POST /api/auth/register-complete
// Body: { email, code }
router.post("/register-complete", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required." });
    }

    // find pending verification
    const record = await EmailVerification.findOne({ email });
    if (!record) {
      return res
        .status(400)
        .json({ message: "No verification request found for this email." });
    }

    // check expiry
    if (record.expiresAt < new Date()) {
      return res
        .status(400)
        .json({ message: "Verification code expired. Please try again." });
    }

    // compare code
    if (record.code !== code) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    // safety check: still no real user with this email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Email already registered. Try logging in." });
    }

    // create real user using stored hashed password
    const user = await User.create({
      name: record.name,
      email: record.email,
      phoneNumber: record.phoneNumber,
      password: record.passwordHash, // already hashed in /register-start
      role: "renter", // or adjust if you want owner-selection later
    });

    // clean up verification
    await EmailVerification.deleteOne({ _id: record._id });

    // sign JWT
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

// POST /api/auth/login
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

// ================== ADMIN LOGIN WITH 2FA ==================

// POST /api/auth/admin-login
// Used only by the web admin panel login page
router.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required." });
    }

    const user = await User.findOne({ email });
    if (!user || user.role !== "admin") {
      // do not reveal whether email exists
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

    // If admin does NOT have 2FA enabled, behave like normal login
    if (!user.twoFAEnabled || !user.twoFASecret) {
      const token = signAuthToken(user);
      return res.json({
        requires2FA: false,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // 2FA enabled → require second step
    const tempToken = signTwoFATempToken(user);
    return res.json({
      requires2FA: true,
      tempToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/admin-login-2fa
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
      window: 1, // allow slight clock drift
    });

    if (!verified) {
      return res.status(400).json({ message: "Invalid 2FA code." });
    }

    const token = signAuthToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Admin 2FA verify error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== ADMIN 2FA SETUP (ENABLE) ==================

// POST /api/auth/admin/2fa/setup
// Must be called by a logged-in admin from the panel
// POST /api/auth/admin/2fa/setup
// Must be called by a logged-in admin from the panel
router.post("/admin/2fa/setup", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    // generate a new secret
    const secret = speakeasy.generateSecret({
      name: `Cartime Admin (${user.email})`,
    });

    user.twoFASecret = secret.base32;
    user.twoFAEnabled = false; // not confirmed yet
    await user.save();

    // build otpauth URL and QR data URL
    const otpauthUrl = secret.otpauth_url;
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    // frontend expects qrCodeDataUrl + secret
    res.json({
      qrCodeDataUrl,
      secret: secret.base32,
    });
  } catch (err) {
    console.error("Admin 2FA setup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/admin/2fa/confirm
// Body: { code }
// User enters code from Microsoft Authenticator to confirm
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

// POST /api/auth/admin/2fa/disable
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

// GET /api/auth/me  -> return current user (without password)
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

// POST /api/auth/email/resend
// POST /api/auth/email/resend
router.post("/email/resend", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "No user found with this email." });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    // generate new 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // save to EmailVerification collection
    await EmailVerification.create({
      email,
      code,
      createdAt: new Date(),
    });

    // send email using your mailer
    await sendEmail({
      to: email,
      subject: "Your Cartime verification code",
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

// POST /api/auth/email/verify
// body: { code: "123456" }
// POST /api/auth/email/verify
router.post("/email/verify", async (req, res) => {
  try {
    console.log("VERIFY BODY:", req.body);
    const { email, code } = req.body;

    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required." });
    }

    // 1) Find latest verification record for this email
    const record = await EmailVerification.findOne({ email })
      .sort({ createdAt: -1 })
      .exec();

    if (!record) {
      return res
        .status(400)
        .json({ message: "No verification request found for this email." });
    }

    // 2) Check expiry (15 minutes)
    if (record.createdAt) {
      const expiresAt = new Date(record.createdAt.getTime() + 15 * 60 * 1000);
      if (Date.now() > expiresAt.getTime()) {
        return res
          .status(400)
          .json({ message: "Verification code has expired." });
      }
    }

    // 3) Compare code
    if (record.code !== code.trim()) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    // 4) If user already exists, just mark verified
    let user = await User.findOne({ email });

    if (!user) {
      // 🚨 This is the case you're hitting now

      if (!record.hashedPassword) {
        // Safety guard: dev mistake or old records
        return res.status(500).json({
          message:
            "Verification data incomplete. Please register again to receive a new code.",
        });
      }

      // ▶️ Create the real user now
      user = await User.create({
        name: record.name || email.split("@")[0],
        email,
        password: record.hashedPassword,
        phoneNumber: record.phoneNumber,
        role: record.role || "renter",
        emailVerified: true,
      });
    } else {
      // If user somehow already exists, just mark verified
      user.emailVerified = true;
      await user.save();
    }

    // 5) Clean up verification docs
    await EmailVerification.deleteMany({ email });

    // 6) Issue auth token
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

// POST /api/auth/social/google
// Body: { idToken }
router.post("/social/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google ID token required." });
    }

    // 1) Verify token with Google
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

    // 2) Check if user exists
    let user = await User.findOne({ email });

    if (user) {
      // if this account was created as local, still allow login but mark provider if needed
      if (!user.authProvider || user.authProvider === "local") {
        // You can keep it or update to google; I'll keep it as-is.
      } else if (user.authProvider !== "google") {
        // Optional safety check
        console.warn(
          `User ${email} logged in via different provider: ${user.authProvider}`
        );
      }
    } else {
      // 3) Create new user with Google provider
      user = await User.create({
        name,
        email,
        password: null, // no password for social
        phoneNumber: "",
        role: "renter",
        status: "active",
        emailVerified: true, // Google verified email
        authProvider: "google",
        providerId: googleUserId,
      });
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    const needsPhoneNumber = !user.phoneNumber;
    // in Login.js after calling social login:
    try {
      const data = await loginWithGoogle();
      if (data?.needsPhoneNumber) {
        navigation.replace("CompletePhone");
      }
    } catch (err) {
      Alert.alert("Google login failed", err.message || "Try again.");
    }
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

// POST /api/auth/social/apple
// Body: { identityToken } (JWT from Apple)
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
        audience: process.env.APPLE_CLIENT_ID, // your app's service ID / client ID
      });
    } catch (e) {
      console.error("Apple token verify error:", e);
      return res.status(400).json({ message: "Invalid Apple token." });
    }

    const appleUserId = decoded.sub;
    const email = decoded.email; // sometimes only on first sign in
    const name = decoded.email?.split("@")[0] || "Apple User";

    if (!email) {
      // In real production, you'd handle "no email" flow using Apple user ID
      return res.status(400).json({
        message:
          "Apple did not return an email. Please use normal login or another method.",
      });
    }

    let user = await User.findOne({ email });

    if (user) {
      if (!user.authProvider || user.authProvider === "local") {
        // ok
      } else if (user.authProvider !== "apple") {
        console.warn(
          `User ${email} logged in via different provider: ${user.authProvider}`
        );
      }
    } else {
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

// POST /api/auth/phone
// Body: { phoneNumber }
// Requires auth
router.post("/phone", requireAuth, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || phoneNumber.trim().length < 5) {
      return res
        .status(400)
        .json({ message: "Valid phone number is required." });
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

router.post("/forgot-password-mobile", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Avoid email enumeration: always respond success
    if (!user) {
      return res.json({
        message: "If that email exists, a reset code has been sent.",
      });
    }

    // 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const salt = await bcrypt.genSalt(10);
    const hashedCode = await bcrypt.hash(code, salt);

    user.resetCode = hashedCode;
    user.resetCodeExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    await sendMail({
      to: user.email,
      subject: "Cartime – Your password reset code",
      html: `
        <p>Hello ${user.name || "there"},</p>
        <p>Your Cartime password reset code is:</p>
        <h2>${code}</h2>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `,
    });

    res.json({
      message: "If that email exists, a reset code has been sent.",
    });
  } catch (err) {
    console.error("forgot-password-mobile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/reset-password-mobile", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res
        .status(400)
        .json({ message: "Email, code and new password are required." });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetCodeExpires: { $gt: Date.now() },
    });

    if (!user || !user.resetCode) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset code." });
    }

    const bcrypt = await import("bcryptjs").then((m) => m.default || m);
    const isMatch = await bcrypt.compare(code, user.resetCode);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset code." });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ message: "Password updated successfully. You can login now." });
  } catch (err) {
    console.error("reset-password-mobile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
