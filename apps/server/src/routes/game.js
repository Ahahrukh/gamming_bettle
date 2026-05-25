import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Bet } from "../models/Bet.js";
import { User } from "../models/User.js";
import { ensureCurrentRound, getGameState } from "../services/roundService.js";

export const gameRouter = express.Router();

gameRouter.get("/state", async (req, res) => {
  res.json(await getGameState());
});

gameRouter.post("/bets", requireAuth, async (req, res) => {
  const color = String(req.body.color || "").toLowerCase();
  const amount = Number(req.body.amount);

  if (!["red", "black"].includes(color)) {
    return res.status(400).json({ message: "Choose red or black" });
  }

  if (!Number.isFinite(amount) || amount < 1) {
    return res.status(400).json({ message: "Minimum bet is ₹1" });
  }

  const round = await ensureCurrentRound();
  if (round.endsAt.getTime() <= Date.now() + 1500) {
    return res.status(409).json({ message: "Round closing. Wait for next round." });
  }

  const user = await User.findById(req.user._id);
  if (!user || user.balance < amount) {
    return res.status(400).json({ message: "Insufficient balance" });
  }

  user.balance = Number((user.balance - amount).toFixed(2));
  await user.save();

  const bet = await Bet.create({
    user: user._id,
    round: round._id,
    roundNumber: round.roundNumber,
    color,
    amount
  });

  res.status(201).json({
    bet,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      balance: user.balance
    }
  });
});

gameRouter.get("/bets/me", requireAuth, async (req, res) => {
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const bets = await Bet.find({ user: req.user._id, createdAt: { $gte: eightDaysAgo } })
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ bets });
});
