const express = require("express");
const router = express.Router();
const User = require("../models/user");
const authenticate = require("../middleware/auth");

const requireAdmin = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ message: "Super-admin access required." });
  }
  next();
};

router.use(authenticate);

router.post("/:id/approve-owner", requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "pending_owner" },
      { role: "admin" },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Pending car owner application not found." });
    }

    res.json({ message: "Car owner approved.", user });
  } catch (error) {
    console.error("OWNER APPROVAL ERROR:", error);
    res.status(500).json({ message: "Could not approve car owner." });
  }
});

router.put("/:id", requireSuperAdmin, async (req, res) => {
  const { name, email, number } = req.body || {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof number !== "string" ||
    !/^[0-9]{11}$/.test(number)
  ) {
    return res.status(400).json({
      message: "Provide a name, valid email address, and 11-digit phone number.",
    });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.name = name.trim();
    user.email = email.trim().toLowerCase();
    user.number = number;
    await user.save();

    const safeUser = user.toObject();
    delete safeUser.password;
    res.json({ message: "User updated.", user: safeUser });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That email address is already in use." });
    }
    console.error("USER UPDATE ERROR:", error);
    res.status(500).json({ message: "Could not update user." });
  }
});

router.get("/count", requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.json({ totalUsers });
  } catch (error) {
    console.error("USERS COUNT ERROR:", error);
    res.status(500).json({ message: "Could not retrieve user count." });
  }
});

// GET all users (admin)
router.get("/", requireSuperAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select("-password"); // hide passwords

    res.json(users);
  } catch (err) {
    console.error("USERS GET ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE user
router.delete("/:id", requireSuperAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot delete the active super-admin account." });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (targetUser.role === "superadmin") {
      return res.status(403).json({ message: "Super-admin accounts cannot be deleted here." });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("USERS DELETE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
