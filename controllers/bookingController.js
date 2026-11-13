const Booking = require("../models/Booking");
const Car = require("../models/Car");

// Get all bookings (admin)
exports.getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("user")
      .populate("car"); // will be null for fallback cars

    // Map bookings to ensure car name is always present
    const formattedBookings = bookings.map((b) => ({
      id: b._id,
      user: b.user,
      car: b.car ? b.car : { name: b.carName }, // fallback
      startDate: b.startDate,
      endDate: b.endDate,
      pickupLocation: b.pickupLocation,
      dropoffLocation: b.dropoffLocation,
      payment: b.payment,
      rentalType: b.rentalType,
      contact: b.contact,
      name: b.name,
      totalPrice: b.totalPrice,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      status: b.status,
      returnedAt: b.returnedAt,
    }));

    res.json(formattedBookings);
  } catch (err) {
    res.status(500).json({ message: "Error getting bookings", error: err.message });
  }
};

// Get bookings of logged-in user
exports.getUserBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user?.id })
      .populate("car");

    const formattedBookings = bookings.map((b) => ({
      id: b._id,
      car: b.car ? b.car : { name: b.carName }, // fallback
      startDate: b.startDate,
      endDate: b.endDate,
      pickupLocation: b.pickupLocation,
      dropoffLocation: b.dropoffLocation,
      payment: b.payment,
      rentalType: b.rentalType,
      contact: b.contact,
      name: b.name,
      totalPrice: b.totalPrice,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      status: b.status,
      returnedAt: b.returnedAt,
    }));

    res.json(formattedBookings);
  } catch (err) {
    res.status(500).json({ message: "Error getting bookings", error: err.message });
  }
};
