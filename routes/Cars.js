const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;
const Car = require("../models/Car");
const authenticate = require("../middleware/auth");

const requireAdmin = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
};

const canManageCar = (car, user) =>
  user?.role === "superadmin" ||
  (user?.role === "admin" && car.ownerId?.toString() === user.id);

const uploadDirectory = path.join(__dirname, "..", "uploads");

const imageExtensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, callback) => {
    if (!imageExtensions[file.mimetype]) {
      const error = new Error("Please upload a JPEG, PNG, WEBP, or GIF image.");
      error.code = "INVALID_IMAGE_TYPE";
      return callback(error);
    }

    callback(null, true);
  },
});

const handleImageUpload = (req, res, next) => {
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "image", maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Each image must be 5 MB or smaller." });
    }
    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ message: "Upload up to 10 images per car." });
    }
    if (error.code === "INVALID_IMAGE_TYPE") {
      return res.status(400).json({ message: error.message });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  });
};

const getUploadedImages = (req) => [
  ...(req.files?.images || []),
  ...(req.files?.image || []),
];

const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary is not configured. Set its credentials in the backend environment.");
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
};

const uploadImageToCloudinary = (file) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    {
      folder: "driveeasy/cars",
      resource_type: "image",
    },
    (error, result) => {
      if (error) return reject(error);
      if (!result?.secure_url || !result.public_id) {
        return reject(new Error("Cloudinary returned an incomplete image upload result."));
      }
      resolve({ url: result.secure_url, publicId: result.public_id });
    }
  );
  Readable.from([file.buffer]).pipe(stream);
});

const uploadImagesToCloudinary = async (files) => {
  if (!files.length) return [];
  configureCloudinary();

  const results = await Promise.allSettled(files.map(uploadImageToCloudinary));
  const uploadedAssets = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedUpload = results.find((result) => result.status === "rejected");
  if (failedUpload) {
    await removeCloudinaryImages(uploadedAssets.map((asset) => asset.publicId));
    throw failedUpload.reason;
  }

  return uploadedAssets;
};

const removeCloudinaryImages = async (publicIds) => {
  if (!publicIds.length) return;
  try {
    configureCloudinary();
    const results = await Promise.allSettled(
      publicIds.map((publicId) => cloudinary.uploader.destroy(publicId, { resource_type: "image" }))
    );
    results
      .filter((result) => result.status === "rejected")
      .forEach((result) => console.error("Could not remove Cloudinary car image:", result.reason));
  } catch (error) {
    console.error("Could not remove Cloudinary car images:", error.message);
  }
};

const removeUploadedImage = async (image) => {
  if (typeof image !== "string" || !image.startsWith("/uploads/")) return;

  const filename = image.slice("/uploads/".length);
  if (!filename || path.basename(filename) !== filename) return;

  try {
    await fs.promises.unlink(path.join(uploadDirectory, filename));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not remove uploaded car image:", error);
    }
  }
};

const removeCarImages = async (car) => {
  const images = [...(car.images || []), car.image].filter(Boolean);
  await Promise.all([
    ...[...new Set(images)].map(removeUploadedImage),
    removeCloudinaryImages(car.imagePublicIds || []),
  ]);
};

// Add a car
router.post("/add", authenticate, requireAdmin, handleImageUpload, async (req, res) => {
  const uploadedImages = getUploadedImages(req);
  let uploadedAssets = [];
  try {
    uploadedAssets = await uploadImagesToCloudinary(uploadedImages);
    const imageUrls = uploadedAssets.map((asset) => asset.url);
    const car = new Car({
      ...req.body,
      image: imageUrls[0] || req.body.image,
      images: imageUrls.length ? imageUrls : req.body.image ? [req.body.image] : [],
      imagePublicIds: uploadedAssets.map((asset) => asset.publicId),
      ownerId: req.user.id,
    });
    await car.save();
    res.status(201).json({ message: "Car added", car });
  } catch (err) {
    console.error("Could not add car or upload its images:", err.message);
    await removeCloudinaryImages(uploadedAssets.map((asset) => asset.publicId));
    res.status(500).json({ message: err.message || "Could not add car." });
  }
});

// Update car
router.put("/update/:id", authenticate, requireAdmin, handleImageUpload, async (req, res) => {
  const uploadedImages = getUploadedImages(req);
  let uploadedAssets = [];
  try {
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ message: "Car not found" });
    if (!canManageCar(car, req.user)) {
      return res.status(403).json({ message: "You can only update cars you uploaded." });
    }

    uploadedAssets = await uploadImagesToCloudinary(uploadedImages);
    ["name", "seats", "transmission", "fuel", "price", "description"].forEach((field) => {
      if (req.body[field] !== undefined) car[field] = req.body[field];
    });
    const currentImages = car.images?.length ? car.images : car.image ? [car.image] : [];
    car.images = [...currentImages, ...uploadedAssets.map((asset) => asset.url)];
    car.imagePublicIds = [...(car.imagePublicIds || []), ...uploadedAssets.map((asset) => asset.publicId)];
    car.image = car.images[0] || car.image;
    const updated = await car.save();
    res.json(updated);
  } catch (err) {
    console.error("Could not update car or upload its images:", err.message);
    await removeCloudinaryImages(uploadedAssets.map((asset) => asset.publicId));
    res.status(500).json({ message: err.message || "Could not update car." });
  }
});

// Delete car
router.delete("/delete/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ message: "Car not found" });
    if (!canManageCar(car, req.user)) {
      return res.status(403).json({ message: "You can only delete cars you uploaded." });
    }

    await car.deleteOne();
    await removeCarImages(car);
    res.json({ message: "Car deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Management list is scoped to the current owner unless requested by the super admin.
router.get("/manage", authenticate, requireAdmin, async (req, res) => {
  try {
    const filter = req.user.role === "superadmin" ? {} : { ownerId: req.user.id };
    const cars = await Car.find(filter).sort({ _id: -1 });
    res.json(cars);
  } catch (err) {
    console.error("Could not load managed cars:", err);
    res.status(500).json({ message: "Could not load cars." });
  }
});

// Get all cars
router.get("/", async (req, res) => {
  try {
    const cars = await Car.find();
    res.json(cars);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
