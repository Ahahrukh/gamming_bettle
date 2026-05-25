import mongoose from "mongoose";

const betSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true },
    roundNumber: { type: Number, required: true },
    color: { type: String, enum: ["red", "black"], required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["pending", "won", "lost"], default: "pending" },
    payout: { type: Number, default: 0 }
  },
  { timestamps: true }
);

betSchema.index({ user: 1, createdAt: -1 });
betSchema.index({ round: 1, status: 1 });

export const Bet = mongoose.model("Bet", betSchema);
