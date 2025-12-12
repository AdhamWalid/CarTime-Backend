// models/UserEvent.js
const mongoose = require("mongoose");

const UserEventSchema = new mongoose.Schema(
  {
    // who triggered the event (can be renter, owner, admin, etc.)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // e.g. "account_created", "account_updated", "booking_created", "car_listed"
    action: {
      type: String,
      required: true,
    },

    // optional target info
    targetType: { type: String }, // "User", "Booking", "Car"
    targetId: { type: String },   // id as string

    // short human-readable description
    description: { type: String },

    // any extra metadata
    meta: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserEvent", UserEventSchema);