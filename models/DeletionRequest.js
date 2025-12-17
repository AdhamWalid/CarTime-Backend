const mongoose = require("mongoose");

const AccountDeletionRequestSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    reason: { type: String, default: "", trim: true },
    source: { type: String, default: "website" }, // website | app | etc.

    status: {
      type: String,
      enum: ["pending", "verified", "completed", "rejected"],
      default: "pending",
    },

    // optional: notes for admin team
    adminNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

// Helpful index: prevent endless duplicate pending requests per email
AccountDeletionRequestSchema.index({ email: 1, status: 1 });

module.exports = mongoose.model(
  "AccountDeletionRequest",
  AccountDeletionRequestSchema
);