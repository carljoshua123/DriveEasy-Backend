const Car = require("../models/Car");

// Add a new car (CORRECTED)
exports.addCar = async (req, res) => {
    try {
        // CRITICAL FIX: Extract ALL fields sent by the frontend form
        const { name, image, seats, transmission, fuel, price, description } = req.body;

        const car = new Car({
            name,
            image, // Added: Image URL
            seats,
            transmission, // Added
            fuel, // Added
            price, // Renamed from 'pricePerDay' to 'price' to match frontend field
            description, // Added
            // Note: 'brand' field removed as it's not sent by the frontend form
        });

        await car.save();
        res.status(201).json({ message: "Car added successfully", car });
    } catch (err) {
        // IMPROVED LOGGING: Prints the exact Mongoose error to the console
        console.error("Mongoose Validation/Save Error:", err.message);
        res.status(500).json({ 
            message: "Error adding car. Check server console for validation details.", 
            error: err.message 
        });
    }
};

// Get all cars
exports.getCars = async (req, res) => {
    try {
        const cars = await Car.find();
        res.json(cars);
    } catch (err) {
        res.status(500).json({ message: "Error fetching cars", error: err.message });
    }
};

// Get a single car
exports.getCar = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ message: "Car not found" });

        res.json(car);
    } catch (err) {
        res.status(500).json({ message: "Error fetching car", error: err.message });
    }
};

// Update car
exports.updateCar = async (req, res) => {
    try {
        const updatedCar = await Car.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json({ message: "Car updated", updatedCar });
    } catch (err) {
        res.status(500).json({ message: "Error updating car", error: err.message });
    }
};

// Delete car
exports.deleteCar = async (req, res) => {
    try {
        await Car.findByIdAndDelete(req.params.id);
        res.json({ message: "Car deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting car", error: err.message });
    }
};