const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    carId: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: false },
    carName: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    pickupLocation: String,
    dropoffLocation: String,
    payment: String,
    rentalType: String,
    contact: String,
    name: String,
    totalPrice: Number,

    // ADD THESE
    status: { type: String, default: "Pending" },
    returnedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);