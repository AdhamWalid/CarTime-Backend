// backend/routes/bookings.js
const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const Car = require("../models/Car");
const User = require("../models/User");
const UserEvent = require("../models/UserEvent");

const { requireAuth } = require("../middleware/auth");
const { sendExpoPushNotification } = require("../utils/expoPush");
const { parseDateOnly, toDateOnlyString } = require("../utils/dateOnly");

// all booking endpoints require login
router.use(requireAuth);

// ---------- helpers ----------
function toUtcStartOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// nights between pickup day and return day (return is exclusive)
function diffNights(startISO, endISO) {
  const start = toUtcStartOfDay(new Date(startISO));
  const end = toUtcStartOfDay(new Date(endISO));
  const ms = end - start;
  const nights = Math.round(ms / (1000 * 60 * 60 * 24));
  return nights;
}

function isValidDate(d) {
  return d instanceof Date && !isNaN(d.getTime());
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

    // startDate & endDate can include time (ISO). endDate is return date-time.
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

    // Nights (min 1)
    const nights = diffNights(start.toISOString(), end.toISOString());
    if (isNaN(nights) || nights < 1) {
      return res.status(400).json({
        message: "Minimum booking is 1 day. Please check your dates.",
      });
    }

    // overlap rule for [start,end): existing.start < newEnd AND existing.end > newStart
    // IMPORTANT: your schema uses car/user fields, not carId/userId
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
      paymentStatus: "paid",
    });

    // Log event
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

    // Push notification to renter
    const renter = await User.findById(req.user.id).select("name expoPushToken");
    if (renter?.expoPushToken) {
      await sendExpoPushNotification(renter.expoPushToken, {
        title: "Booking Confirmed ✅",
        body: `Your booking for ${booking.carTitle} is confirmed.`,
        data: { type: "BOOKING_CONFIRMED", bookingId: booking._id.toString() },
      });
    }

    // Push notification to owner (must fetch owner user)
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

// ---------- GET /api/bookings/car/:carId/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD ----------
router.get("/car/:carId/calendar", async (req, res) => {
  try {
    const { carId } = req.params;

    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);

    if (!from || !to || to <= from) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    const bookings = await Booking.find({
      car: carId,
      status: { $in: ["pending", "confirmed"] },
      startDate: { $lt: to },
      endDate: { $gt: from },
    }).select("startDate endDate");

    // Expand booked DAYS (nights) - endDate day is NOT blocked.
    const bookedSet = new Set();

    for (const b of bookings) {
      let cur = toUtcStartOfDay(b.startDate);
      const endDay = toUtcStartOfDay(b.endDate);

      while (cur < endDay) {
        bookedSet.add(toDateOnlyString(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    return res.json({
      carId,
      from: toDateOnlyString(from),
      to: toDateOnlyString(to),
      bookedDates: Array.from(bookedSet).sort(),
    });
  } catch (err) {
    console.error("Calendar error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;