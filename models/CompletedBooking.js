const mongoose = require("mongoose");

const completedBookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    carId: { type: mongoose.Schema.Types.ObjectId, ref: "Car" },
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
    returnedAt: Date,
    status: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompletedBooking", completedBookingSchema);
