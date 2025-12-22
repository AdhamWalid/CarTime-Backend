// models/Invoice.js
const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },

    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true, index: true },

    renterName: { type: String, default: "" },
    renterEmail: { type: String, default: "", index: true },
    contactPhone: { type: String, default: "" },

    carTitle: { type: String, default: "" },
    carPlate: { type: String, default: "" },
    pickupCity: { type: String, default: "" },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    nights: { type: Number, default: 1 },

    currency: { type: String, default: "MYR" },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    promoCode: { type: String, default: null },
    amount: { type: Number, default: 0 },

    status: { type: String, default: "issued", enum: ["issued", "void", "refunded"] },

    pdf: {
      storage: { type: String, default: "none", enum: ["none", "gridfs"] },
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      filename: { type: String, default: "" },
      mime: { type: String, default: "application/pdf" },
    },

    email: {
      sent: { type: Boolean, default: false },
      sentAt: { type: Date, default: null },
      error: { type: String, default: null },
    },
  },
  { timestamps: true }
);

// useful indexes for admin filters
InvoiceSchema.index({ createdAt: -1 });
// ❌ remove this line:
// InvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model("Invoice", InvoiceSchema);