// routes/promos.js
const express = require("express");
const PromoCode = require("../models/PromoCode");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// POST /api/promos/apply
router.post("/apply", requireAuth, async (req, res) => {
  try {
    const { code, baseAmount } = req.body;

    if (!code || !baseAmount) {
      return res
        .status(400)
        .json({ message: "Code and baseAmount are required." });
    }

    const promo = await PromoCode.findOne({ code: code.toUpperCase() });
    if (!promo) {
      return res.status(404).json({ message: "Promo code not found." });
    }

    if (!promo.active) {
      return res.status(400).json({ message: "Promo code is not active." });
    }

    const now = new Date();
    if (promo.validFrom && now < promo.validFrom) {
      return res.status(400).json({ message: "Promo is not valid yet." });
    }
    if (promo.validTo && now > promo.validTo) {
      return res.status(400).json({ message: "Promo has expired." });
    }

    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
      return res.status(400).json({ message: "Promo usage limit reached." });
    }

    const amount = Number(baseAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid base amount." });
    }

    if (promo.minAmount && amount < promo.minAmount) {
      return res.status(400).json({
        message: `Minimum booking amount for this promo is RM ${promo.minAmount}.`,
      });
    }

    // calculate discount
    let discount = 0;
    if (promo.discountType === "percent") {
      discount = (amount * promo.discountValue) / 100;
    } else {
      discount = promo.discountValue;
    }

    if (promo.maxDiscount) {
      discount = Math.min(discount, promo.maxDiscount);
    }

    if (discount <= 0) {
      return res
        .status(400)
        .json({ message: "This promo does not give any discount." });
    }

    const finalAmount = Math.max(0, amount - discount);

    // increment usage count
    promo.usedCount = (promo.usedCount || 0) + 1;
    await promo.save();

    res.json({
      code: promo.code,
      discount,
      finalAmount,
      description: promo.description || "",
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    });
  } catch (err) {
    console.error("Apply promo error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;