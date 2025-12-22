const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },

    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // renter
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true, index: true },

    renterName: String,
    renterEmail: String,
    contactPhone: String,

    carTitle: String,
    carPlate: String,
    pickupCity: String,

    startDate: Date,
    endDate: Date,
    nights: Number,

    currency: { type: String, default: "MYR" },
    amount: { type: Number, required: true }, // final amount
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    promoCode: { type: String, default: null },

    status: { type: String, enum: ["issued", "void"], default: "issued" },

    // If you store PDF:
    pdf: {
      storage: { type: String, enum: ["none", "gridfs", "s3", "local"], default: "none" },
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null }, // GridFS id, or your own id
      url: { type: String, default: null }, // S3/local URL
      filename: { type: String, default: null },
      mime: { type: String, default: "application/pdf" },
    },

    // email tracking (optional but useful)
    email: {
      sent: { type: Boolean, default: false },
      sentAt: { type: Date, default: null },
      error: { type: String, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", InvoiceSchema);