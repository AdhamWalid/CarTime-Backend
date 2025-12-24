const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },

    userType: { type: String, enum: ["Customer", "Car Owner"], required: true },
    issueType: { type: String, required: true, trim: true, maxlength: 80 },

    bookingId: { type: String, trim: true, maxlength: 60 },
    carId: { type: String, trim: true, maxlength: 60 },

    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },

    status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open" },

    source: { type: String, default: "web-support" }, // "web-support" / "app" / "admin"
    meta: {
      ip: { type: String },
      userAgent: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);