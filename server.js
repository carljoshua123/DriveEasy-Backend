const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const User = require("./models/user");
const adminRoutes = require("./routes/adminRoutes");

// Load environment variables
dotenv.config();
dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

// Initialize Express
const app = express();
let runtimeReady;

const initializeRuntime = async () => {
  await connectDB();

  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!superAdminEmail && !superAdminPassword) {
    console.warn("Super-admin provisioning skipped; deployment credentials are not configured.");
    return;
  }

  if (!superAdminEmail || !superAdminPassword || superAdminPassword.length < 16) {
    throw new Error(
      "Configure both SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 16 characters."
    );
  }

  let superAdmin = await User.findOne({ email: superAdminEmail });
  if (!superAdmin) {
    superAdmin = new User({
      name: process.env.SUPER_ADMIN_NAME?.trim() || "DriveEasy Super Admin",
      email: superAdminEmail,
      number: process.env.SUPER_ADMIN_NUMBER?.trim() || "00000000000",
      password: superAdminPassword,
      role: "superadmin",
    });
    await superAdmin.save();
    console.log("Built-in super-admin account created from environment settings.");
  } else if (superAdmin.role !== "superadmin") {
    const isLegacyDefaultAdmin =
      superAdmin.email === "admin@carrental.com" &&
      superAdmin.role === "admin" &&
      await superAdmin.comparePassword("Admin@123");

    if (isLegacyDefaultAdmin) {
      superAdmin.password = superAdminPassword;
    }
    superAdmin.name = process.env.SUPER_ADMIN_NAME?.trim() || superAdmin.name;
    superAdmin.number = process.env.SUPER_ADMIN_NUMBER?.trim() || superAdmin.number;
    superAdmin.role = "superadmin";
    await superAdmin.save();
    console.log("Promoted the configured super-admin account.");
  }

  const legacyAdmin = await User.findOne({
    email: "admin@carrental.com",
    role: "admin",
  });
  if (
    legacyAdmin &&
    legacyAdmin.email !== superAdminEmail &&
    await legacyAdmin.comparePassword("Admin@123")
  ) {
    legacyAdmin.role = "pending_owner";
    await legacyAdmin.save();
    console.warn("Disabled the legacy built-in admin account; configure a super-admin account.");
  }
};

// -------------------
// Middleware
// -------------------
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (process.env.VERCEL) {
  app.use(async (req, res, next) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        if (mongoose.connection.readyState !== 2 || !runtimeReady) {
          runtimeReady = initializeRuntime().catch((error) => {
            runtimeReady = null;
            throw error;
          });
        }
        await runtimeReady;
      }
      next();
    } catch (error) {
      console.error("Serverless runtime initialization failed:", error.message);
      res.status(503).json({ message: "Backend is not configured correctly." });
    }
  });
}

// Admin routes
app.use("/api/admin", adminRoutes);

// -------------------
// Routes
// -------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api/cars", require("./routes/cars"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/users", require("./routes/users"));
app.use("/api/messages", require("./routes/messages"));

// Test route
app.get("/", (req, res) => res.send("Car Rental API running"));

// -------------------
// Error handler
// -------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error", error: err.message });
});

// -------------------
// Start server
// -------------------
const PORT = process.env.PORT || 5000;
let httpServer;

const startServer = async () => {
  try {
    await initializeRuntime();

    httpServer = await new Promise((resolve, reject) => {
      const server = app.listen(PORT, () => resolve(server));
      server.once("error", reject);
    });
    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error("Server startup failed:", error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  }
};

const stopServer = (signal) => {
  console.log(`${signal} received. Shutting down...`);
  if (!httpServer) {
    mongoose.disconnect().finally(() => process.exit());
    return;
  }

  httpServer.close(() => {
    mongoose.disconnect().finally(() => process.exit());
  });
};

if (process.env.VERCEL) {
  module.exports = app;
} else {
  process.once("SIGINT", () => stopServer("SIGINT"));
  process.once("SIGTERM", () => stopServer("SIGTERM"));
  startServer();
}