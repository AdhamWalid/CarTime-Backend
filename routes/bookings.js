// backend/routes/bookings.js
const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const Car = require("../models/Car");
const User = require("../models/User");
const UserEvent = require("../models/UserEvent");
const sendEmail = require("../utils/sendEmail"); // your util path
const { bookingInvoiceHtml, invoiceNumber } = require("../utils/invoiceEmail");
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
    const html = bookingInvoiceHtml({
      renterName: renter.name,
      renterEmail: renter.email,
      booking,
      nights,
    });

    await sendEmail({
      to: renter.email,
      subject: `CarTime Invoice ${invoiceNumber(booking._id)} — ${booking.carTitle}`,
      html,
    });
  } else {
    console.log("No renter email found; skipping invoice email.");
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