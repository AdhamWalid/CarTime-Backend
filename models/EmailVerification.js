// models/EmailVerification.js
const mongoose = require("mongoose");

const EmailVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true,
  },
  code: {
    type: String,
    required: true,
  },

  // pending registration data 👇
  name: String,
  hashedPassword: String,
  phoneNumber: String,
  role: {
    type: String,
    enum: ["renter", "owner", "admin"],
    default: "renter",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("EmailVerification", EmailVerificationSchema);