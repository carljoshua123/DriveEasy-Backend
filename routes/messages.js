const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../middleware/auth");
const MessageConversation = require("../models/MessageConversation");
const User = require("../models/user");

const router = express.Router();
const MAX_MESSAGE_LENGTH = 2000;

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ message: "Only the super admin can access the support inbox." });
  }
  next();
};

const normalizeConversationRoles = (conversation) => {
  if (!conversation) return conversation;

  const participantRole = conversation.userId?.role;
  const normalizedMessages = conversation.messages.map((message) => {
    const isSuperAdminMessage =
      message.senderRole === "superadmin" ||
      message.sender === "superadmin" ||
      (message.sender === "admin" && !message.senderRole);

    return {
      ...message,
      senderRole: isSuperAdminMessage
        ? "superadmin"
        : ["user", "admin"].includes(participantRole)
          ? participantRole
          : message.senderRole || "user",
    };
  });

  return {
    ...conversation,
    messages: normalizedMessages,
  };
};

router.use(authenticate);

router.get("/me", async (req, res) => {
  if (!["user", "admin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Only users and car owners can open a support conversation." });
  }

  try {
    const conversation = await MessageConversation.findOne({
      userId: req.user.id,
    }).select("userId messages updatedAt").populate("userId", "name email role");
    res.json(normalizeConversationRoles(conversation?.toObject()) || { messages: [] });
  } catch (error) {
    console.error("Could not load user messages:", error);
    res.status(500).json({ message: "Could not load your messages." });
  }
});

router.post("/me", async (req, res) => {
  if (!["user", "admin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Only users and car owners can message the super admin." });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      message: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  try {
    const conversation = await MessageConversation.findOneAndUpdate(
      { userId: req.user.id },
      {
        $setOnInsert: { userId: req.user.id },
        $push: {
          messages: {
            sender: req.user.role,
            senderRole: req.user.role,
            text,
          },
        },
      },
      { new: true, upsert: true, runValidators: true }
    ).select("userId messages updatedAt").populate("userId", "name email role");

    res.status(201).json(normalizeConversationRoles(conversation.toObject()));
  } catch (error) {
    console.error("Could not send user message:", error);
    res.status(500).json({ message: "Could not send your message." });
  }
});

router.get("/admin/conversations", requireSuperAdmin, async (req, res) => {
  try {
    const conversations = await MessageConversation.find()
      .sort({ updatedAt: -1 })
      .populate("userId", "name email role")
      .lean();
    res.json(
      conversations
        .filter((conversation) => conversation.userId)
        .map(normalizeConversationRoles)
    );
  } catch (error) {
    console.error("Could not load admin messages:", error);
    res.status(500).json({ message: "Could not load conversations." });
  }
});

router.post(
  "/admin/conversations/:userId",
  requireSuperAdmin,
  async (req, res) => {
    const { userId } = req.params;
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user ID." });
    }

    if (!text || text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`,
      });
    }

    try {
      const participant = await User.findById(userId).select("role");
      if (!participant || !["user", "admin"].includes(participant.role)) {
        return res.status(404).json({ message: "User or car-owner conversation not found." });
      }

      const conversation = await MessageConversation.findOneAndUpdate(
        { userId },
        {
          $push: {
            messages: {
              sender: "superadmin",
              senderRole: "superadmin",
              text,
            },
          },
        },
        { new: true, runValidators: true }
      ).populate("userId", "name email role");

      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found." });
      }

      res.status(201).json(normalizeConversationRoles(conversation.toObject()));
    } catch (error) {
      console.error("Could not send admin reply:", error);
      res.status(500).json({ message: "Could not send your reply." });
    }
  }
);

module.exports = router;
