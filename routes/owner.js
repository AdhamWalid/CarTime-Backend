// routes/owner.js
const express = require("express");
const Car = require("../models/Car");
const { requireAuth, requireRole } = require("../middleware/auth");
const UserEvent = require("../models/UserEvent");
const router = express.Router();

/**
 * POST /api/owner/cars
 * Owner submits a new car → status = "pending"
 */
// routes/owner.js
router.post("/cars", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const {
      title,
      make,
      model,
      year,
      pricePerDay,
      hasDeposit,
      depositAmount,
      locationCity,
      imageUrl,
      plateNumber,

      roadTaxExpiry,
      insuranceExpiry,
      transmission,
      fuelType,
      seats,
      mileage,
      description,
      pickupInstructions,
    } = req.body;

    if (!title || !make || !model || !pricePerDay || !plateNumber) {
      return res.status(400).json({
        message:
          "Title, make, model, plateNumber, and pricePerDay are required.",
      });
    }

    const car = await Car.create({
      ownerId: req.user.id,
      title,
      make,
      model,
      plateNumber,
      year,
      pricePerDay,
      hasDeposit: !!hasDeposit,
      depositAmount: hasDeposit ? Number(depositAmount || 0) : 0,
      locationCity,
      imageUrl: imageUrl || "",

      roadTaxExpiry: roadTaxExpiry || null,
      insuranceExpiry: insuranceExpiry || null,
      transmission: transmission || null,
      fuelType: fuelType || null,
      seats: seats != null ? Number(seats) : null,
      mileage: mileage != null ? Number(mileage) : null,
      description: description || "",
      pickupInstructions: pickupInstructions || "",

      status: "pending", // always pending for admin review
    });

    await UserEvent.create({
      user: req.user.id,
      action: "car_listed",
      targetType: "Car",
      targetId: car._id.toString(),
      description: `Car listed: ${car.title || `${car.make} ${car.model}`}`,
      meta: {
        title: car.title,
        plateNumber: car.plateNumber,
        pricePerDay: car.pricePerDay,
        locationCity: car.locationCity,
      },
    });

    res.status(201).json({
      message: "Car submitted for review.",
      car,
    });
  } catch (err) {
    console.error("Create car error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/owner/cars
 * Owner sees all their cars
 */
router.get("/cars", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const cars = await Car.find({ ownerId: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(cars);
  } catch (err) {
    console.error("List owner cars error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
