const mongoose = require("mongoose");

const ActivityLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // the admin
      required: true,
    },
    action: { type: String, required: true }, // e.g. "APPROVE_CAR", "BAN_USER"
    targetType: { type: String }, // "car", "user", "booking"
    targetId: { type: String }, // id as string
    description: { type: String }, // human readable text
    meta: { type: Object }, // extra info if any
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);
