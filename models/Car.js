// models/Car.js
const mongoose = require("mongoose");

const CarSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  title: { type: String, required: true },
  make: { type: String, required: true },
  model: { type: String, required: true },
  plateNumber: { type: String, required: false },

  year: Number,
  pricePerDay: { type: Number, required: true },

  hasDeposit: { type: Boolean, default: false },
  depositAmount: { type: Number, default: 0 },

  locationCity: String,

  imageUrl: { type: String, default: "" },

  // New fields
  roadTaxExpiry: { type: Date, default: null },
  insuranceExpiry: { type: Date, default: null },

  transmission: {
    type: String,
    enum: ["Automatic", "Manual", null],
    default: null,
  },
  fuelType: {
    type: String,
    enum: ["Petrol", "Diesel", "Hybrid", "EV", null],
    default: null,
  },
  seats: { type: Number, default: null },
  mileage: { type: Number, default: null },

  description: { type: String, default: "" },
  pickupInstructions: { type: String, default: "" },

  status: {
    type: String,
    enum: ["pending", "published", "suspended", "Remove"],
    default: "pending",
  },

    // ✅ NEW: extra photos for carousel
  images: {
    type: [String],
    default: [],
  },
  
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Car", CarSchema);