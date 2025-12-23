const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    currency: { type: String, default: "MYR" },

    balance: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ["active", "frozen"], default: "active" },

    // optional: internal notes
    notes: { type: String, default: "" },
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);