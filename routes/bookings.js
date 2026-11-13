const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const CompletedBooking = require("../models/CompletedBooking");
const User = require("../models/user");
const authenticate = require("../middleware/auth");

const phoneDigits = (value) => String(value || "").replace(/\D/g, "");

const linkLegacyBookings = async (Model, user) => {
  if (!user?.name || !user?.number) return;

  const escapedName = user.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = await Model.find({
    userId: null,
    user: null,
    name: { $regex: `^\\s*${escapedName}\\s*$`, $options: "i" },
  })
    .select("_id contact")
    .lean();
  const matchingIds = candidates
    .filter((booking) => phoneDigits(booking.contact) === phoneDigits(user.number))
    .map((booking) => booking._id);

  if (matchingIds.length) {
    await Model.updateMany(
      { _id: { $in: matchingIds }, userId: null, user: null },
      { $set: { userId: user._id } }
    );
  }
};

// POST /api/bookings
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      carId,
      carName,
      startDate,
      endDate,
      pricePerDay,
      name,
      contact,
      pickupLocation,
      dropoffLocation,
      payment,
      rentalType,
    } = req.body;

    if (req.user?.role !== "user") {
      return res.status(403).json({ message: "Only renter accounts can create bookings." });
    }

    if (!carName || !startDate || !endDate || !pricePerDay || !name || !contact) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const validCar = carId && mongoose.Types.ObjectId.isValid(carId) ? carId : undefined;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    if (end < start) {
      return res.status(400).json({ message: "End date must be after start date" });
    }

    const dayCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const totalPrice = dayCount * Number(pricePerDay);

    const newBooking = new Booking({
      userId: req.user.id,
      carId: validCar,
      carName,
      startDate: start,
      endDate: end,
      pickupLocation,
      dropoffLocation,
      payment,
      rentalType,
      contact,
      name,
      totalPrice,
    });

    const savedBooking = await newBooking.save();

    return res.status(201).json({
      message: "Booking successful",
      booking: savedBooking,
    });

  } catch (err) {
    console.error("BOOKING ROUTE ERROR:", err);
    console.log("Request body:", req.body);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/bookings/mine
router.get("/mine", authenticate, async (req, res) => {
  if (req.user?.role !== "user") {
    return res.status(403).json({ message: "Booking history is available to renter accounts only." });
  }

  try {
    const user = await User.findById(req.user.id).select("name number").lean();
    await Promise.all([
      linkLegacyBookings(Booking, user),
      linkLegacyBookings(CompletedBooking, user),
    ]);

    const [bookings, completedBookings] = await Promise.all([
      Booking.find({ $or: [{ userId: req.user.id }, { user: req.user.id }] })
        .populate("carId", "image images")
        .lean(),
      CompletedBooking.find({ $or: [{ userId: req.user.id }, { user: req.user.id }] })
        .populate("carId", "image images")
        .lean(),
    ]);

    const history = [
      ...bookings,
      ...completedBookings.map((booking) => ({
        ...booking,
        status: "Completed",
      })),
    ].sort(
      (left, right) =>
        new Date(right.createdAt || right.startDate) -
        new Date(left.createdAt || left.startDate)
    );

    res.json(history);
  } catch (err) {
    console.error("BOOKING HISTORY ERROR:", err);
    res.status(500).json({ message: "Could not load booking history." });
  }
});

// GET /api/bookings
router.get("/", async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 }).populate("userId", "name email");
    res.json(bookings);
  } catch (err) {
    console.error("BOOKINGS GET ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/bookings/:id
router.delete("/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: "Booking deleted successfully" });
  } catch (err) {
    console.error("DELETE BOOKING ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
// PATCH /api/bookings/:id → approve booking
router.patch("/:id", async (req, res) => {
  try {
    const { status } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json(booking);
  } catch (err) {
    console.error("APPROVE BOOKING ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/bookings/:id/return → mark as returned
router.patch("/:id/return", async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      {
        status: "Returned",
        returnedAt: new Date(),
      },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json(booking);
  } catch (err) {
    console.error("RETURN BOOKING ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});