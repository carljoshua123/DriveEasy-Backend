const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTER USER
exports.register = async (req, res) => {
  try {
    const { name, email, number, password } = req.body;
    const accountType = req.body.accountType || "renter";

    if (!name || !email || !password || !number) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!["renter", "carOwner"].includes(accountType)) {
      return res.status(400).json({ message: "Choose a valid account type." });
    }

    // Check if email exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create user
    const newUser = new User({
      name,
      email,
      number,
      password,
      role: accountType === "carOwner" ? "pending_owner" : "user",
    });
    await newUser.save();

    const message = accountType === "carOwner"
      ? "Car owner application submitted. You can sign in after an admin approves your account."
      : "User registered successfully.";
    res.status(201).json({ message, accountType });
  } catch (error) {
    console.error(error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        message: `Duplicate field value: ${JSON.stringify(error.keyValue)}`,
      });
    }

    res.status(500).json({ message: "Server error" });
  }
};

// LOGIN USER
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const configuredSuperAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (configuredSuperAdminEmail && user.email === configuredSuperAdminEmail && user.role !== "superadmin") {
      user.role = "superadmin";
      await user.save();
    }

    if (user.role === "pending_owner") {
      return res.status(403).json({
        message: "Your car owner account is awaiting admin approval.",
        code: "OWNER_APPROVAL_PENDING",
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        number: user.number,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
