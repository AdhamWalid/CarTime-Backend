// routes/wallet.js
const express = require("express");
const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const WalletTx = require("../models/WalletTransaction");
const { requireAuth } = require("../middleware/auth");
const { getOrCreateWallet } = require("../utils/getOrCreateWallet");
const { genTopupReference, normalizeRef } = require("../utils/walletRef");

const router = express.Router();

// all wallet routes require login
router.use(requireAuth);

// GET /api/wallet  -> wallet balance/status
router.get("/", async (req, res) => {
  try {
    const w = await getOrCreateWallet(req.user.id);
    res.json({
      walletId: w._id,
      currency: w.currency,
      balance: w.balance,
      status: w.status,
      updatedAt: w.updatedAt,
    });
  } catch (err) {
    console.error("Wallet get error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/wallet/transactions?limit=30
router.get("/transactions", async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit || 30));

    const rows = await WalletTx.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(rows);
  } catch (err) {
    console.error("Wallet tx list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/wallet/topup-request
// body: { amount, proofUrl?, reference? }
router.post("/topup-request", async (req, res) => {
  try {
    const amt = Number(req.body.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Optional: simple limits for safety
    if (amt < 10) return res.status(400).json({ message: "Minimum top-up is RM 10" });
    if (amt > 5000) return res.status(400).json({ message: "Maximum top-up is RM 5000" });

    const w = await getOrCreateWallet(req.user.id);
    if (w.status !== "active") return res.status(400).json({ message: "Wallet is frozen" });

    // ✅ block if user already has pending topup
    const existingPending = await WalletTx.findOne({
      user: req.user.id,
      type: "topup",
      status: "pending",
    }).lean();

    if (existingPending) {
      return res.status(400).json({
        message: "You already have a pending top-up. Please wait for approval or cancel it.",
        pendingTxId: existingPending._id,
        reference: existingPending.reference,
        amount: existingPending.amount,
      });
    }

    // ✅ generate unique reference (retry on rare collision)
    let reference = "";
    let referenceNorm = "";
    for (let i = 0; i < 6; i++) {
      reference = genTopupReference();          // e.g. CT-A9F2-7K3D
      referenceNorm = normalizeRef(reference);  // uppercase + no spaces, <=20
      const exists = await WalletTx.exists({ type: "topup", referenceNorm });
      if (!exists) break;
      if (i === 5) return res.status(500).json({ message: "Could not generate unique reference. Try again." });
    }

    // Optional: expire pending after 48h
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const tx = await WalletTx.create({
      wallet: w._id,
      user: req.user.id,
      type: "topup",
      direction: "credit",
      amount: amt,
      currency: w.currency || "MYR",
      status: "pending",
      reference,
      referenceNorm,
      expiresAt,
      proofUrl: "", // removed for now
    });

    return res.status(201).json({
      message: "Top-up request created. Transfer using the reference shown.",
      tx,
      bank: {

        name: "Maybank",
        accountName: "CarTime Sdn Bhd",
        accountNumber: "xxxx-xxxx-xxxx",
        referenceMaxLen: 20,
      },
    });
  } catch (err) {
    console.error("Topup request error:", err);

    // If unique index throws duplicate (very rare), tell user to retry
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Reference collision. Please try again." });
    }

    res.status(500).json({ message: "Server error" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const wallet = await getOrCreateWallet(userId);

    // Optional small summary for UI
    const [pendingTopups, lastTx] = await Promise.all([
      WalletTx.countDocuments({ user: userId, type: "topup", status: "pending" }),
      WalletTx.findOne({ user: userId }).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      wallet: {
        _id: wallet._id,
        user: wallet.user,
        currency: wallet.currency,
        balance: wallet.balance,
        status: wallet.status,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
      summary: {
        pendingTopups,
        lastTx: lastTx
          ? {
              _id: lastTx._id,
              type: lastTx.type,
              direction: lastTx.direction,
              amount: lastTx.amount,
              status: lastTx.status,
              createdAt: lastTx.createdAt,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("Wallet /me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;