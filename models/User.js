// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, required: true },
    password: String,
    phoneNumber: String,
    role: {
      type: String,
      enum: ["renter", "owner", "admin"],
      default: "renter",
    },
    status: {
      type: String,
      enum: ["active", "banned"],
      default: "active",
    },


    authProvider: {
    type: String,
    enum: ["local", "google", "apple"],
    default: "local",
  },
  providerId: { type: String, default: "" }, // e.g. Google sub, Apple sub


    expoPushToken: { type: String },

    // 2FA (already added before)
    twoFAEnabled: { type: Boolean, default: false },
    twoFASecret: { type: String },
    twoFAConfirmedAt: { type: Date },

    // 🔐 EMAIL VERIFICATION
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationCode: { type: String }, // 6-digit code
    emailVerificationExpiresAt: { type: Date },

    // 📱 PHONE VERIFICATION (we’ll wire later)
    isPhoneVerified: { type: Boolean, default: false },
    phoneVerificationCode: { type: String },
    phoneVerificationExpiresAt: { type: Date },

    // in User schema
    resetCode: { type: String },
    resetCodeExpires: { type: Date },
  },
  
  { timestamps: true }
);

// comparePassword (you already have this)
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", UserSchema);