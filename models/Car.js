const mongoose = require("mongoose");

const carSchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String },
  images: { type: [String], default: [] },
  seats: { type: Number, required: true },
  transmission: { type: String },
  fuel: { type: String },
  price: { type: String, required: true },   // ₱3500/day
  description: { type: String },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Car", carSchema);
