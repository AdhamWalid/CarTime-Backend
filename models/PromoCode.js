// models/PromoCode.js
const mongoose = require("mongoose");

const PromoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
    },
    // "percent" = percentage off, "flat" = fixed RM amount
    discountType: {
      type: String,
      enum: ["percent", "flat"],
      default: "percent",
    },
    discountValue: {
      type: Number,
      required: true,
      // if percent → 5,10,20 etc; if flat → 20 (RM)
    },
    minAmount: {
      type: Number,
      default: 0, // min booking total to use this code
    },
    maxDiscount: {
      type: Number, // optional: cap discount, e.g. max RM 100
    },
    validFrom: {
      type: Date,
    },
    validTo: {
      type: Date,
    },
    active: {
      type: Boolean,
      default: true,
    },
    usageLimit: {
      type: Number, // optional: total times this code can be used
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PromoCode", PromoCodeSchema);