const jwt = require("jsonwebtoken");
const User = require("../models/user");

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ msg: "Invalid token" });
  }

  try {
    const user = await User.findById(decoded.id).select("role email").lean();
    if (!user) {
      return res.status(401).json({ msg: "Account no longer exists" });
    }

    const configuredSuperAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    const role = user.email === configuredSuperAdminEmail ? "superadmin" : user.role;

    req.user = { ...decoded, id: String(user._id), role };
    return next();
  } catch (error) {
    console.error("AUTHENTICATION LOOKUP ERROR:", error);
    return res.status(500).json({ msg: "Could not verify account permissions" });
  }
};
