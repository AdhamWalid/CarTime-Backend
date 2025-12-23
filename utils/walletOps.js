// utils/walletOps.js
const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const WalletTx = require("../models/WalletTransaction");
const { getOrCreateWallet } = require("./getOrCreateWallet");

async function creditWallet({ userId, amount, type = "topup", decidedBy = null, proofUrl = "", reference = "", bookingId = null }) {
  if (!userId) throw new Error("Missing userId");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ user: userId }).session(session);
    const w = wallet || (await Wallet.create([{ user: userId, balance: 0, currency: "MYR" }], { session })).at(0);

    if (w.status !== "active") throw new Error("Wallet is frozen");

    const before = Number(w.balance || 0);
    const after = before + amt;

    // create tx
    const tx = await WalletTx.create(
      [
        {
          wallet: w._id,
          user: userId,
          type,
          direction: "credit",
          amount: amt,
          currency: w.currency || "MYR",
          status: "approved",
          proofUrl,
          reference,
          booking: bookingId || null,
          decidedBy,
          decidedAt: decidedBy ? new Date() : null,
          balanceBefore: before,
          balanceAfter: after,
        },
      ],
      { session }
    );

    // update balance
    w.balance = after;
    await w.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { wallet: w, tx: tx[0] };
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    throw e;
  }
}

async function debitWallet({ userId, amount, type = "booking_debit", bookingId = null }) {
  if (!userId) throw new Error("Missing userId");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ user: userId }).session(session);
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.status !== "active") throw new Error("Wallet is frozen");

    const before = Number(wallet.balance || 0);
    if (before < amt) throw new Error("Insufficient wallet balance");
    const after = before - amt;

    const tx = await WalletTx.create(
      [
        {
          wallet: wallet._id,
          user: userId,
          type,
          direction: "debit",
          amount: amt,
          currency: wallet.currency || "MYR",
          status: "approved",
          booking: bookingId || null,
          balanceBefore: before,
          balanceAfter: after,
        },
      ],
      { session }
    );

    wallet.balance = after;
    await wallet.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { wallet, tx: tx[0] };
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    throw e;
  }
}

module.exports = { creditWallet, debitWallet };