const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const User = require("../models/user");
const Car = require("../models/Car");
const authenticate = require("../middleware/auth");

const requireDashboardRole = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
};

router.get("/dashboard", authenticate, requireDashboardRole, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === "superadmin";
    const cars = await Car.find(isSuperAdmin ? {} : { ownerId: req.user.id })
      .select("_id name ownerId createdAt")
      .populate("ownerId", "name role")
      .lean();
    const carIds = cars.map((car) => car._id);
    const bookingFilter = isSuperAdmin
      ? {}
      : { carId: { $in: carIds } };

    const [bookings, recentUsers] = await Promise.all([
      Booking.find(bookingFilter)
        .sort({ createdAt: -1 })
        .populate("userId", "name role")
        .lean(),
      isSuperAdmin
        ? User.find({ role: { $in: ["user", "pending_owner", "admin"] } })
            .select("name role createdAt")
            .sort({ createdAt: -1 })
            .limit(10)
            .lean()
        : Promise.resolve([]),
    ]);

    const notifications = [
      ...bookings
        .filter((booking) => isSuperAdmin || !["admin", "superadmin"].includes(booking.userId?.role))
        .map((booking) => ({
        id: `booking-${booking._id}`,
        kind: "booking",
        message: `${booking.userId?.name || booking.name || "A user"} (${booking.userId?.role === "admin" ? "Car Owner" : "User"}) booked ${booking.carName || "a car"}.`,
        createdAt: booking.createdAt,
      })),
      ...(isSuperAdmin
        ? cars
            .filter((car) => car.ownerId)
            .map((car) => ({
              id: `car-${car._id}`,
              kind: "car",
              message: `${car.ownerId.name} (${car.ownerId.role === "superadmin" ? "Super Admin" : "Car Owner"}) uploaded ${car.name}.`,
              createdAt: car.createdAt,
            }))
        : []),
      ...recentUsers.map((user) => ({
        id: `user-${user._id}`,
        kind: "account",
        message: `${user.name} registered as ${user.role === "user" ? "User" : "Car Owner"}.`,
        createdAt: user.createdAt,
      })),
    ]
      .filter((activity) => activity.createdAt)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, 10);

    res.json({
      totalBookings: bookings.length,
      totalUsers: isSuperAdmin ? await User.countDocuments() : undefined,
      totalCars: cars.length,
      totalRevenue: bookings.reduce((sum, booking) => sum + (Number(booking.totalPrice) || 0), 0),
      activeRentals: bookings.filter((booking) => booking.status !== "Returned").length,
      recentBookings: bookings.slice(0, 5),
      notifications,
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);
    res.status(500).json({ message: "Could not load dashboard overview." });
  }
});

// GET /api/admin/overview
router.get("/overview", async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalCars = await Car.countDocuments();

    const latestBooking = await Booking.findOne()
      .sort({ createdAt: -1 })
      .populate("userId", "name email");

    let activity = "No recent activity";

    if (latestBooking) {
      const carName = latestBooking.carName || "a car";
      const userName =
        latestBooking.userId?.name ||
        latestBooking.userId?.email ||
        "a user";

      activity = `Latest booking: ${carName} by ${userName}`;
    }

    res.json({
      totalBookings,
      totalUsers,
      totalCars,
      activity,
    });
  } catch (err) {
    console.error("Overview error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;