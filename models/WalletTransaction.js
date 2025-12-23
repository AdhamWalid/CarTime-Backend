const mongoose = require("mongoose");

const walletTxSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    type: {
      type: String,
      enum: ["topup", "booking_debit", "refund", "adjustment"],
      required: true,
      index: true,
    },

    direction: { type: String, enum: ["credit", "debit"], required: true },

    amount: { type: Number, required: true, min: 0.01 },

    currency: { type: String, default: "MYR" },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    // for admin manual review
    proofUrl: { type: String, default: "" }, // receipt screenshot link (optional)

    // links to other objects
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },

    // who approved/rejected (admin)
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },

    // balance snapshots for audit (optional but VERY useful)
    balanceBefore: { type: Number, default: null },
    balanceAfter: { type: Number, default: null },
    reference: { type: String, default: "" },        // shown to user/admin
    referenceNorm: { type: String, default: "", index: true }, // uppercase/no spaces for matching
    expiresAt: { type: Date, default: null, index: true },     // optional expiry for pending
  },
  { timestamps: true }
);

// Only enforce uniqueness when referenceNorm exists (partial index)
walletTxSchema.index(
  { type: 1, referenceNorm: 1 },
  { unique: true, partialFilterExpression: { referenceNorm: { $type: "string", $ne: "" } } }
);

// One pending topup per user
walletTxSchema.index(
  { user: 1, type: 1, status: 1 },
  { partialFilterExpression: { type: "topup", status: "pending" } }
);

walletTxSchema.index({ user: 1, createdAt: -1 });
walletTxSchema.index({ wallet: 1, createdAt: -1 });

walletTxSchema.index(
  { type: 1, booking: 1 },
  { unique: true, partialFilterExpression: { type: "booking_debit", booking: { $ne: null } } }
);

module.exports = mongoose.model("WalletTransaction", walletTxSchema);