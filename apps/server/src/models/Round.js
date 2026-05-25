import mongoose from "mongoose";

const roundSchema = new mongoose.Schema(
  {
    roundNumber: { type: Number, required: true, unique: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    revealEndsAt: { type: Date, default: null },
    outcome: { type: String, enum: ["red", "black", null], default: null },
    redCards: [{ rank: String, suit: String, value: Number }],
    blackCards: [{ rank: String, suit: String, value: Number }],
    redScore: { type: Number, default: 0 },
    blackScore: { type: Number, default: 0 },
    winningReason: { type: String, default: "" },
    status: { type: String, enum: ["open", "settled"], default: "open" }
  },
  { timestamps: true }
);

roundSchema.index({ status: 1, endsAt: 1 });

export const Round = mongoose.model("Round", roundSchema);
