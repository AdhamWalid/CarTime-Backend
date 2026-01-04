// backend/routes/bookings.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const { uploadPdfToGridFS } = require("../utils/uploadPdfToGridFS");
const Booking = require("../models/Booking");
const Car = require("../models/Car");
const User = require("../models/User");
const UserEvent = require("../models/UserEvent");
const Invoice = require("../models/invoice");
const sendEmail = require("../utils/sendEmail");
const { buildBookingInvoicePdfBuffer } = require("../utils/invoicePdf");
const { invoiceNumber } = require("../utils/invoiceNumber");
const { requireAuth } = require("../middleware/auth");
const requireVerified = require("../middleware/requireVerified");

const { sendExpoPushNotification } = require("../utils/expoPush");
const { parseDateOnly, toDateOnlyString } = require("../utils/dateOnly");

const Wallet = require("../models/Wallet");
const WalletTx = require("../models/WalletTransaction");

// ---------- helpers ----------
function toUtcStartOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function diffNights(startISO, endISO) {
  const start = toUtcStartOfDay(new Date(startISO));
  const end = toUtcStartOfDay(new Date(endISO));
  const ms = end - start;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function isValidDate(d) {
  return d instanceof Date && !isNaN(d.getTime());
}

function addDaysUTC(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function money(n) {
  return `RM ${Number(n || 0).toFixed(2)}`;
}
function fmtDT(d) {
  return new Date(d).toLocaleString("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:6px 0; color:#64748b;">${label}</td>
      <td style="padding:6px 0; font-weight:800; text-align:right; color:#0f172a;">${value}</td>
    </tr>
  `;
}

function buildInvoiceEmailHtml({ renterName, booking, nights }) {
  const inv = invoiceNumber(booking._id);

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial; background:#f6f7fb; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #eef0f4; border-radius:16px; overflow:hidden;">
      <div style="padding:18px 20px; background:linear-gradient(135deg,#0b1220,#111827);">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div style="font-size:14px; letter-spacing:0.4px; color:#cbd5e1; font-weight:700;">CarTime</div>
            <div style="font-size:20px; color:#fff; font-weight:900; margin-top:2px;">Booking Invoice</div>
            <div style="font-size:12px; color:rgba(255,255,255,0.70); margin-top:4px;">Invoice #${inv}</div>
          </div>
          <div style="padding:8px 10px; border-radius:999px; background:rgba(212,175,55,0.18); border:1px solid rgba(212,175,55,0.35); color:#D4AF37; font-weight:800; font-size:12px;">
            Pending ⏳
          </div>
        </div>
      </div>

      <div style="padding:18px 20px; color:#0f172a;">
        <p style="margin:0 0 12px; color:#334155;">
          Hi <b>${renterName || "Customer"}</b>, your booking was created and is pending wallet payment. Your PDF invoice is attached.
        </p>

        <div style="border:1px solid #eef0f4; border-radius:14px; padding:14px; margin:12px 0;">
          <div style="font-weight:900; margin-bottom:10px;">Trip details</div>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            ${row("Car", booking.carTitle)}
            ${row("Plate", booking.carPlate || "N/A")}
            ${row("Pickup city", booking.pickupCity || "—")}
            ${row("Pickup", fmtDT(booking.startDate))}
            ${row("Return", fmtDT(booking.endDate))}
            ${row("Payment", booking.paymentStatus)}
          </table>
        </div>

        <div style="border:1px solid #eef0f4; border-radius:14px; padding:14px; margin:12px 0;">
          <div style="font-weight:900; margin-bottom:10px;">Pricing</div>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            ${row("Days", String(nights))}
            ${row("Rate / day", money(booking.carPricePerDay))}
            ${row("Subtotal", money(booking.totalPrice))}
            <tr>
              <td style="padding:10px 0; font-weight:900;">Total</td>
              <td style="padding:10px 0; font-weight:900; text-align:right; color:#D4AF37;">${money(booking.totalPrice)}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top:14px;">
          <a href="https://cartime.my" style="display:inline-block; padding:12px 16px; border-radius:12px; background:#111827; color:#fff; text-decoration:none; font-weight:900;">
            Open CarTime
          </a>
          <span style="display:inline-block; margin-left:10px; color:#64748b; font-size:12px;">
            Need help? support@cartime.my
          </span>
        </div>

        <div style="margin-top:16px; color:#94a3b8; font-size:11px;">
          Invoice is generated automatically. Please keep this email for your records.
        </div>
      </div>
    </div>
  </div>
  `;
}

// ✅ PUBLIC: GET /api/bookings/car/:carId/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// FIXED: Only block dates for CONFIRMED + PAID bookings (Option 1)
// ✅ PUBLIC: GET /api/bookings/car/:carId/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/car/:carId/calendar", async (req, res) => {
  try {
    const { carId } = req.params;

    const fromStr = String(req.query.from || "");
    const toStr = String(req.query.to || "");

    if (!fromStr || !toStr) {
      return res.status(400).json({ error: "from/to are required (YYYY-MM-DD)" });
    }

    const from = parseDateOnly(fromStr);
    const to = parseDateOnly(toStr);

    if (!from || !to || to <= from) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    // ✅ MATCH OPTION 1: ONLY paid+confirmed blocks
    const bookings = await Booking.find({
      car: carId,
      status: { $in: ["scheduled", "active", "confirmed"] }, // ✅ include scheduled/active
      paymentStatus: "paid",
      startDate: { $lt: to },
      endDate: { $gt: from },
    }).select("startDate endDate");

    const blocked = new Set();

    bookings.forEach((b) => {
    let cur = new Date(b.startDate);
    cur.setUTCHours(0, 0, 0, 0);

    const end = new Date(b.endDate);
    end.setUTCHours(0, 0, 0, 0);

      // Block days from start (inclusive) to end (exclusive)
    while (cur < end) {
      blocked.add(toDateOnlyString(cur)); // must return YYYY-MM-DD in UTC
      cur = addDaysUTC(cur, 1);
    }
    });

    return res.json({ carId, bookedDates: [...blocked] }); // ✅ must be bookedDates
  } catch (err) {
    console.error("Calendar error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Everything below requires login
router.use(requireAuth);

// ---------- POST /api/bookings ----------
router.post("/",  requireVerified , async (req, res) => {
  try {
    const { carId, startDate, endDate, contactPhone } = req.body;

    if (!carId || !startDate || !endDate || !contactPhone) {
      return res.status(400).json({
        message: "carId, startDate, endDate, contactPhone are required",
      });
    }
        function toUTCMidnight(dateObj) {
  return new Date(Date.UTC(
    dateObj.getUTCFullYear(),
    dateObj.getUTCMonth(),
    dateObj.getUTCDate(),
    0, 0, 0, 0
  ));
}

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const startUTC = toUTCMidnight(start);
    const endUTC   = toUTCMidnight(end);
    if (!isValidDate(start) || !isValidDate(end) || end <= start) {
      return res.status(400).json({
        message: "Invalid dates. endDate must be after startDate.",
      });
    }

    const car = await Car.findById(carId).lean();
    if (!car || car.status !== "published") {
      return res.status(400).json({ message: "Car not available for booking" });
    }

    const nights = diffNights(start.toISOString(), end.toISOString());
    if (isNaN(nights) || nights < 1) {
      return res.status(400).json({
        message: "Minimum booking is 1 day. Please check your dates.",
      });
    }

    // ✅ OPTION 1: Only PAID+CONFIRMED blocks dates
const conflict = await Booking.findOne({
  car: carId,
  status: { $in: ["scheduled", "active", "confirmed"] },
  paymentStatus: "paid",
  startDate: { $lt: endUTC },
  endDate: { $gt: startUTC },
}).session(session);

if (conflict) {
  return res.status(409).json({
    error: "DATES_UNAVAILABLE",
    message: "Selected dates are already booked.",
    conflict: {
      startDate: conflict.startDate,
      endDate: conflict.endDate,
    },
  });
}

    const booking = await Booking.create({
      user: req.user.id,
      car: carId,

      carPlate: car.plateNumber || "N/A",
      carTitle: car.title || `${car.make || ""} ${car.model || ""}`.trim(),
      carPricePerDay: car.pricePerDay || 0,

      startDate: start,
      endDate: end,

      totalPrice,
      pickupCity: car.locationCity,
      contactPhone,

      status: "pending",
      paymentStatus: "pending",
      paymentMethod: "wallet",
      amountPaid: 0,
      paidAt: null,
      walletTxId: null,
    });

    await UserEvent.create({
      user: req.user.id,
      action: "booking_created",
      targetType: "Booking",
      targetId: booking._id.toString(),
      description: `Booking created (pending payment) for ${booking.carTitle}`,
      meta: {
        carTitle: booking.carTitle,
        carPlate: booking.carPlate,
        totalPrice: booking.totalPrice,
        startDate: booking.startDate,
        endDate: booking.endDate,
        pickupCity: booking.pickupCity,
      },
    });

    const renter = await User.findById(req.user.id).select("name email expoPushToken");

    const invNo = invoiceNumber(booking._id);

    const invoiceDoc = await Invoice.create({
      invoiceNumber: invNo,
      booking: booking._id,
      user: req.user.id,
      car: carId,

      renterName: renter?.name || "",
      renterEmail: renter?.email || "",
      contactPhone,

      carTitle: booking.carTitle,
      carPlate: booking.carPlate,
      pickupCity: booking.pickupCity,

      startDate: booking.startDate,
      endDate: booking.endDate,
      nights,

      currency: "MYR",
      subtotal: booking.totalPrice,
      discount: 0,
      promoCode: null,
      amount: booking.totalPrice,

      status: "issued",
      pdf: { storage: "none" },
      email: { sent: false, sentAt: null, error: null },
    });

    // PDF + email (DON’T fail booking if this fails)
    try {
      if (renter?.email) {
        const pdfBuffer = await buildBookingInvoicePdfBuffer({
          renterName: renter.name,
          renterEmail: renter.email,
          booking,
          nights,
          invoiceNumber: invNo,
          paymentStatus: "pending",
        });

        if (req.app.locals.gridfsBucket) {
          const fileId = await uploadPdfToGridFS({
            bucket: req.app.locals.gridfsBucket,
            buffer: pdfBuffer,
            filename: `CarTime-Invoice-${invNo}.pdf`,
            metadata: {
              invoiceNumber: invNo,
              bookingId: booking._id.toString(),
              userId: req.user.id,
            },
          });

          await Invoice.updateOne(
            { _id: invoiceDoc._id },
            {
              $set: {
                "pdf.storage": "gridfs",
                "pdf.fileId": fileId,
                "pdf.filename": `CarTime-Invoice-${invNo}.pdf`,
                "pdf.mime": "application/pdf",
              },
            }
          );
        }

        const html = buildInvoiceEmailHtml({ renterName: renter.name, booking, nights });

        await sendEmail({
          to: renter.email,
          subject: `CarTime Invoice ${invNo} — Pending Payment`,
          html,
          text: `Your booking was created and is pending payment. Invoice #${invNo} is attached.`,
          attachments: [
            {
              filename: `CarTime-Invoice-${invNo}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
              contentDisposition: "attachment",
            },
          ],
        });

        await Invoice.updateOne(
          { _id: invoiceDoc._id },
          { $set: { "email.sent": true, "email.sentAt": new Date(), "email.error": null } }
        );
      }
    } catch (e) {
      console.error("Invoice PDF/email failed:", e);
      await Invoice.updateOne(
        { _id: invoiceDoc._id },
        { $set: { "email.sent": false, "email.error": String(e?.message || e) } }
      );
    }

    if (renter?.expoPushToken) {
      await sendExpoPushNotification(renter.expoPushToken, {
        title: "Booking created ⏳",
        body: `Pay with wallet credits to confirm ${booking.carTitle}.`,
        data: { type: "BOOKING_PENDING_PAYMENT", bookingId: booking._id.toString() },
      });
    }

    return res.status(201).json({
      booking,
      invoiceId: invoiceDoc._id,
      invoiceNumber: invNo,
      next: { payWithWallet: `/api/bookings/${booking._id}/pay-with-wallet` },
    });
  } catch (err) {
    console.error("Create booking error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- GET /api/bookings/my ----------
router.get("/my", async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(bookings);
  } catch (err) {
    console.error("My bookings error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- POST /api/bookings/:id/pay-with-wallet ----------
// ---------- POST /api/bookings/pay-with-wallet ----------
// Creates booking + debits wallet in ONE transaction.
// If insufficient funds => NO booking is created.
router.post("/pay-with-wallet", requireVerified, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { carId, startDate, endDate, contactPhone } = req.body;

    if (!carId || !startDate || !endDate || !contactPhone) {
      return res.status(400).json({ message: "carId, startDate, endDate, contactPhone are required" });
    }

const startRaw = new Date(startDate);
const endRaw = new Date(endDate);

if (!isValidDate(startRaw) || !isValidDate(endRaw)) {
  return res.status(400).json({ message: "Invalid dates." });
}

const start = toUtcStartOfDay(startRaw);
const end   = toUtcStartOfDay(endRaw);

if (end <= start) {
  return res.status(400).json({ message: "Invalid dates. endDate must be after startDate." });
}

    function toUTCMidnight(dateObj) {
  return new Date(Date.UTC(
    dateObj.getUTCFullYear(),
    dateObj.getUTCMonth(),
    dateObj.getUTCDate(),
    0, 0, 0, 0
  ));
}

const startUTC = toUTCMidnight(start);
const endUTC   = toUTCMidnight(end);

    if (!isValidDate(startUTC) || !isValidDate(endUTC) || endUTC <= startUTC) {
      return res.status(400).json({ message: "Invalid dates. endDate must be after startDate." });
    }

    const car = await Car.findById(carId).session(session);
    if (!car || car.status !== "published") {
      return res.status(400).json({ message: "Car not available" });
    }

    const nights = diffNights(startUTC.toISOString(), endUTC.toISOString());
    if (isNaN(nights) || nights < 1) {
      return res.status(400).json({ message: "Minimum booking is 1 day. Please check your dates." });
    }
    const totalPrice = nights * (car.pricePerDay || 0);
if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
  return res.status(400).json({ message: "Invalid booking amount" });
}

    // block dates that are already PAID + (scheduled/active/confirmed)
    const conflict = await Booking.findOne({
      car: carId,
      status: { $in: ["scheduled", "active", "confirmed"] },
      paymentStatus: "paid",
startDate: { $lt: endUTC },
endDate: { $gt: startUTC },
    }).session(session);

    if (conflict) {
      return res.status(409).json({
        error: "DATES_UNAVAILABLE",
        message: "Selected dates are already booked.",
      });
    }

    const amount = nights * (car.pricePerDay || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid booking amount" });
    }

    // wallet
    let wallet = await Wallet.findOne({ user: req.user.id }).session(session);
    if (!wallet) {
      wallet = (await Wallet.create([{ user: req.user.id, balance: 0, currency: "MYR" }], { session }))[0];
    }
    if (wallet.status !== "active") {
      return res.status(400).json({ message: "Wallet is not active" });
    }

    const before = Number(wallet.balance || 0);
    if (before < amount) {
      // ✅ IMPORTANT: no booking created
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "INSUFFICIENT_FUNDS",
        message: "Insufficient wallet balance",
        needed: amount,
        balance: before,
      });
    }

    // Create booking ONLY after we know funds are enough
    const booking = (await Booking.create([{
      user: req.user.id,
      car: carId,
      carPlate: car.plateNumber || "N/A",
      carTitle: car.title || `${car.make || ""} ${car.model || ""}`.trim(),
      carPricePerDay: car.pricePerDay || 0,
      startDate: startUTC,
      endDate: endUTC,
      totalPrice: amount,
      pickupCity: car.locationCity,
      contactPhone,

      status: "scheduled",         // ✅ paid but not activated yet
      paymentStatus: "paid",
      paymentMethod: "wallet",
      amountPaid: amount,
      paidAt: new Date(),
    }], { session }))[0];

    // debit wallet + tx
    const after = before - amount;
    wallet.balance = after;
    await wallet.save({ session });

    const ref = `BOOKING:${String(booking._id).slice(-8)}`;
    const tx = (await WalletTx.create([{
      wallet: wallet._id,
      user: req.user.id,
      type: "booking_debit",
      direction: "debit",
      amount,
      currency: wallet.currency || "MYR",
      status: "approved",
      booking: booking._id,
      reference: ref,
      referenceNorm: ref.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
      decidedAt: new Date(),
      balanceBefore: before,
      balanceAfter: after,
    }], { session }))[0];

    booking.walletTxId = tx._id;
    await booking.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      message: "Paid with wallet and booking scheduled",
      booking,
      wallet: { balance: after, currency: wallet.currency || "MYR" },
      txId: tx._id,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("pay-with-wallet (create) error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


router.get("/active", requireVerified , async (req, res) => {
  try {
    const now = new Date();

    const booking = await Booking.findOne({
      user: req.user.id,
      status: { $in: ["scheduled", "active", "confirmed"] },
      paymentStatus: "paid", // keep it clean: only paid bookings show banner
      endDate: { $gt: now }, // still relevant
    })
      .sort({ startDate: 1 }) // next upcoming first
      .select("car carTitle pickupCity startDate endDate status paymentStatus")
      .lean();

    return res.json({ booking: booking || null });
  } catch (err) {
    console.error("Active booking error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/bookings/:id  (auth)
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const b = await Booking.findOne({ _id: req.params.id, user: req.user.id }).lean();
    if (!b) return res.status(404).json({ message: "Not found" });
    return res.json({ booking: b });
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;