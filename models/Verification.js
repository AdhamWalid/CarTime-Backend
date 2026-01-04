// models/Verification.js
const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },      // e.g. "licenseFront"
    filename: { type: String, required: true }, // stored filename on disk
    originalName: { type: String, default: "" },
    mime: { type: String, default: "" },
    size: { type: Number, default: 0 },
    path: { type: String, required: true },     // absolute/relative server path
  },
  { _id: false }
);

const VerificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },

    status: {
      type: String,
      enum: ["not_submitted", "pending", "approved", "rejected"],
      default: "not_submitted",
    },

    // what the user submitted
    idType: { type: String, enum: ["passport", "mykad", "none"], default: "none" },

    files: {
      licenseFront: { type: FileSchema, default: null },
      licenseBack: { type: FileSchema, default: null },

      mykadFront: { type: FileSchema, default: null },
      mykadBack: { type: FileSchema, default: null },

      passport: { type: FileSchema, default: null },
    },

    note: { type: String, default: "" }, // admin note (optional)
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },

    submittedAt: { type: Date, default: null },

    attempts: { type: Number, default: 0 },        // how many times user submitted
    lastSubmitAt: Date,                             // last submit time
    cooldownUntil: Date,                            // optional anti-spam cooldown
  },
  { timestamps: true }
);

module.exports = mongoose.model("Verification", VerificationSchema);