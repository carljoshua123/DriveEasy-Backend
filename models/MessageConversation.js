const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["user", "admin", "superadmin"],
    },
    text: {
      type: String,
      required: true,
      maxlength: 2000,
      trim: true,
    },
  },
  { timestamps: true }
);

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.MessageConversation ||
  mongoose.model("MessageConversation", conversationSchema);
