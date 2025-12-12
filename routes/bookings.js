// backend/routes/bookings.js
const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const Car = require("../models/Car");
const UserEvent = require("../models/UserEvent");
const { requireAuth } = require("../middleware/auth");
const User = require("../models/User");
const { sendExpoPushNotification } = require("../utils/expoPush");
// all booking endpoints require login
router.use(requireAuth);

// helper: compute number of days (min 1)
function diffDays(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const ms = end - start;
  const days = ms / (1000 * 60 * 60 * 24);
  return Math.round(days);
}

/**
 * POST /api/bookings
 * Body: { carId, startDate, endDate, contactPhone }
 */
router.post("/", async (req, res) => {
  try {
    // pseudo-helper you can call in screens
    if (res.status === 403) {
      const data = await res.json();
      if (data.message?.toLowerCase().includes("banned")) {
        Alert.alert("Account banned", data.message, [
          {
            text: "OK",
            onPress: () => logout(), // from AuthContext
          },
        ]);
        return;
      }
    }
    const { carId, startDate, endDate, contactPhone } = req.body;

    if (!carId || !startDate || !endDate || !contactPhone) {
      return res.status(400).json({
        message: "carId, startDate, endDate, contactPhone are required",
      });
    }

    const car = await Car.findById(carId);
    if (!car || car.status !== "published") {
      return res.status(400).json({ message: "Car not available for booking" });
    }

    const days = diffDays(startDate, endDate);
    if (isNaN(days) || days < 1) {
      return res.status(400).json({
        message: "Minimum booking is 1 day. Please check your dates.",
      });
    }

    const totalPrice = days * car.pricePerDay;

    const booking = await Booking.create({
      user: req.user.id,
      car: car._id,
      carPlate: car.plateNumber || "N/A",
      carTitle: car.title || `${car.make} ${car.model}`,
      carPricePerDay: car.pricePerDay,
      startDate,
      endDate,
      totalPrice,
      pickupCity: car.locationCity,
      contactPhone,
      status: "confirmed",
      paymentStatus: "paid",
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


    // message bits
    const carName = car.title || `${car.make} ${car.model}`;
    const daysLabel = `${days} day${days > 1 ? "s" : ""}`;

    const renter = await User.findById(req.user.id).select(
      "name expoPushToken"
    );
    if (renter?.expoPushToken) {
      await sendExpoPushNotification(renter.expoPushToken, {
        title: "Booking Confirmed ✅",
        body: `Your booking for ${booking.carTitle} is confirmed.`,
        data: {
          type: "BOOKING_CONFIRMED",
          bookingId: booking._id.toString(),
        },
      });
    }

    // 🔔 Push notification to the owner (car owner)
    if (car.ownerId && car.ownerId.expoPushToken) {
      await sendExpoPushNotification(car.ownerId.expoPushToken, {
        title: "New booking 📅",
        body: `${renter?.name || "A customer"} booked your ${booking.carTitle}.`,
        data: {
          type: "NEW_BOOKING",
          bookingId: booking._id.toString(),
          carId: car._id.toString(),
        },
      });
    }

    res.status(201).json(booking);
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/bookings/my  – current user's bookings
 */
router.get("/my", async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(bookings);
  } catch (err) {
    console.error("My bookings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
