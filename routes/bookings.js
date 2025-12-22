// backend/routes/bookings.js
const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const Car = require("../models/Car");
const User = require("../models/User");
const UserEvent = require("../models/UserEvent");
const sendEmail = require("../utils/sendEmail"); // your util path
const { bookingInvoiceHtml } = require("../utils/invoiceEmail");
const { buildBookingInvoicePdfBuffer, invoiceNumber } = require("../utils/invoicePdf");
const { requireAuth } = require("../middleware/auth");
const { sendExpoPushNotification } = require("../utils/expoPush");
const { parseDateOnly, toDateOnlyString } = require("../utils/dateOnly");

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

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

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

    const bookings = await Booking.find({
      car: carId, // ✅ correct field
      status: { $in: ["pending", "confirmed"] },
      startDate: { $lt: to },
      endDate: { $gt: from },
    }).select("startDate endDate");

    const blocked = new Set();

    bookings.forEach((b) => {
      let cur = new Date(b.startDate);
      cur.setHours(0, 0, 0, 0);

      const end = new Date(b.endDate);
      end.setHours(0, 0, 0, 0);

      // Block days from start (inclusive) to end (exclusive)
      while (cur < end) {
        blocked.add(toDateOnlyString(cur));
        cur = addDays(cur, 1);
      }
    });

    return res.json({ carId, bookedDates: [...blocked] });
  } catch (err) {
    console.error("Calendar error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Everything below requires login
router.use(requireAuth);

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

function buildInvoiceEmailHtml({ renterName, booking, nights }) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial; line-height:1.45; color:#111;">
    <h2 style="margin:0 0 6px;">CarTime — Booking Invoice</h2>
    <p style="margin:0 0 14px; color:#555;">Hi ${renterName || "Customer"}, your booking is confirmed ✅</p>

    <div style="padding:14px; border:1px solid #eee; border-radius:12px; margin: 12px 0;">
      <h3 style="margin:0 0 10px;">Trip details</h3>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:6px 0; color:#666;">Car</td><td style="padding:6px 0; font-weight:700; text-align:right;">${booking.carTitle}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Plate</td><td style="padding:6px 0; font-weight:700; text-align:right;">${booking.carPlate || "N/A"}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Pickup city</td><td style="padding:6px 0; font-weight:700; text-align:right;">${booking.pickupCity || "—"}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Pickup</td><td style="padding:6px 0; font-weight:700; text-align:right;">${fmtDT(booking.startDate)}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Return</td><td style="padding:6px 0; font-weight:700; text-align:right;">${fmtDT(booking.endDate)}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Status</td><td style="padding:6px 0; font-weight:700; text-align:right;">${booking.status}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Payment</td><td style="padding:6px 0; font-weight:700; text-align:right;">${booking.paymentStatus}</td></tr>
      </table>
    </div>

    <div style="padding:14px; border:1px solid #eee; border-radius:12px; margin: 12px 0;">
      <h3 style="margin:0 0 10px;">Pricing</h3>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:6px 0; color:#666;">Days</td><td style="padding:6px 0; font-weight:700; text-align:right;">${nights}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Rate / day</td><td style="padding:6px 0; font-weight:700; text-align:right;">${money(booking.carPricePerDay)}</td></tr>
        <tr><td style="padding:6px 0; color:#666;">Subtotal</td><td style="padding:6px 0; font-weight:700; text-align:right;">${money(booking.totalPrice)}</td></tr>
        <tr><td style="padding:10px 0; font-weight:900;">Total</td><td style="padding:10px 0; font-weight:900; text-align:right; color:#D4AF37;">${money(booking.totalPrice)}</td></tr>
      </table>
    </div>
    <a href="cartime://my-bookings" 
   style="display:inline-block; padding:12px 16px; border-radius:12px; background:#111; color:#fff; text-decoration:none; font-weight:800;">
  View my booking
</a>
    <p style="margin-top:14px; color:#666;">
      PDF invoice is attached. If you need help, reply to this email or contact support@cartime.my.
    </p>
  </div>`;
}

// ---------- POST /api/bookings ----------
router.post("/", async (req, res) => {
  try {
    const { carId, startDate, endDate, contactPhone } = req.body;

    if (!carId || !startDate || !endDate || !contactPhone) {
      return res.status(400).json({
        message: "carId, startDate, endDate, contactPhone are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

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

    const conflict = await Booking.findOne({
      car: carId,
      status: { $in: ["pending", "confirmed"] },
      startDate: { $lt: end },
      endDate: { $gt: start },
    }).select("_id startDate endDate");

    if (conflict) {
      return res.status(409).json({
        error: "DATES_UNAVAILABLE",
        message: "Selected dates are already booked.",
      });
    }

    const totalPrice = nights * (car.pricePerDay || 0);

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

      status: "confirmed",
      paymentStatus: "pending",
    });

    await UserEvent.create({
      user: req.user.id,
      action: "booking_created",
      targetType: "Booking",
      targetId: booking._id.toString(),
      description: `Booking created for ${booking.carTitle}`,
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

    // ✅ Email invoice to renter (do NOT fail booking if email fails)
try {
  if (renter?.email) {
    const pdfBuffer = await buildBookingInvoicePdfBuffer({
      renterName: renter.name,
      renterEmail: renter.email,
      booking,
      nights,
    });

    const html = buildInvoiceEmailHtml({
      renterName: renter.name,
      booking,
      nights,
    });

    await sendEmail({
      to: renter.email,
      subject: `CarTime Invoice ${invoiceNumber(booking._id)} — ${booking.carTitle}`,
      html,
      attachments: [
        {
          filename: `CarTime-Invoice-${invoiceNumber(booking._id)}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  }
} catch (e) {
  console.error("Invoice email failed:", e);
}

    if (renter?.expoPushToken) {
      await sendExpoPushNotification(renter.expoPushToken, {
        title: "Booking Confirmed ✅",
        body: `Your booking for ${booking.carTitle} is confirmed.`,
        data: { type: "BOOKING_CONFIRMED", bookingId: booking._id.toString() },
      });
    }




    if (car.ownerId) {
      const owner = await User.findById(car.ownerId).select("expoPushToken name");
      if (owner?.expoPushToken) {
        await sendExpoPushNotification(owner.expoPushToken, {
          title: "New booking 📅",
          body: `${renter?.name || "A customer"} booked your ${booking.carTitle}.`,
          data: {
            type: "NEW_BOOKING",
            bookingId: booking._id.toString(),
            carId: carId.toString(),
          },
        });
      }
    }

    return res.status(201).json(booking);
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

module.exports = router;