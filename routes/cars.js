// routes/cars.js
const express = require("express");
const Car = require("../models/Car");
const UserEvent = require("../models/UserEvent");
const router = express.Router();

router.get("/", async (req, res) => {
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

  try {
    const cars = await Car.find({ status: "published" })
      .sort({ createdAt: -1 })
      .populate("ownerId", "name");

    res.json(
      cars.map((car) => ({
        _id: car._id,
        title: car.title,
        make: car.make,
        model: car.model,
        year: car.year,
        pricePerDay: car.pricePerDay,
        locationCity: car.locationCity,
        status: car.status,
        ownerName: car.ownerId?.name || null,
        imageUrl: car.imageUrl || "", // 👈 include images
        plateNumber: car.plateNumber, // 👈 include plate number
        hasDeposit: car.hasDeposit,
        depositAmount: car.depositAmount,
        transmission: car.transmission,
        fuelType: car.fuelType,
        seats: car.seats,
        description: car.description,
        pickupInstructions: car.pickupInstructions,
        tier:car.tier
      }))
    );
  } catch (err) {
    console.error("Public cars error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/admin/cars/:id/unpublish
router.post("/cars/:id/unpublish", async (req, res) => {
  try {
    const { id } = req.params;

    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    // Only published cars make sense to unpublish
    if (car.status !== "published") {
      return res.status(400).json({
        message: `Car is already ${car.status}, cannot unpublish.`,
      });
    }

    car.status = "suspended"; // or "pending" if you prefer
    await car.save();

    return res.json(car);
  } catch (err) {
    console.error("Admin unpublish car error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
