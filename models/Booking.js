const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },

    carPlate: String,
    carTitle: String,
    carPricePerDay: Number,

    startDate: { type: Date, required: true, index: true }, // pickup
    endDate: { type: Date, required: true, index: true },   // checkout (exclusive)

    totalPrice: { type: Number, required: true },
    pickupCity: String,
    contactPhone: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled" , "scheduled"],
      default: "pending",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    paymentMethod: { type: String, enum: ["wallet" , "stripe"], default: "wallet" },
    amountPaid: { type: Number, default: 0 },
    paidAt: { type: Date, default: null },
    walletTxId: { type: mongoose.Schema.Types.ObjectId, ref: "WalletTransaction", default: null },
  
  },
  { timestamps: true }
);

bookingSchema.index({
  car: 1,
  startDate: 1,
  endDate: 1,
  status: 1,
});
module.exports = mongoose.model("Booking", bookingSchema);
