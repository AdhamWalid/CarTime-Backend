const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },

    carPlate: { type: String },
    carTitle: { type: String },
    carPricePerDay: { type: Number },

    startDate: { type: Date, required: true, index: true }, // pickup
    endDate: { type: Date, required: true, index: true },   // checkout (exclusive)

    totalPrice: { type: Number, required: true },
    pickupCity: { type: String },

    contactPhone: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "confirmed",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "paid",
    },
  },
  { timestamps: true }
);

bookingSchema.index({
  carId: 1,
  startDate: 1,
  endDate: 1,
  status: 1,
});
module.exports = mongoose.model("Booking", bookingSchema);
