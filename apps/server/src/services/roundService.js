import crypto from "node:crypto";
import cron from "node-cron";
import { Bet } from "../models/Bet.js";
import { Round } from "../models/Round.js";
import { User } from "../models/User.js";
import { env } from "../config/env.js";

const roundMs = env.roundSeconds * 1000;
const revealMs = 5000;
const suits = ["hearts", "diamonds", "clubs", "spades"];
const ranks = [
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 11 },
  { rank: "Q", value: 12 },
  { rank: "K", value: 13 },
  { rank: "A", value: 14 }
];

function isRevealing(round, now = new Date()) {
  return round.status === "settled" && round.revealEndsAt && round.revealEndsAt.getTime() > now.getTime();
}

function publicRound(round, now = new Date()) {
  const revealing = isRevealing(round, now);
  const showCards = round.status === "settled";

  return {
    id: round._id,
    roundNumber: round.roundNumber,
    startsAt: round.startsAt,
    endsAt: round.endsAt,
    revealEndsAt: round.revealEndsAt,
    outcome: round.outcome,
    redCards: showCards ? round.redCards : [],
    blackCards: showCards ? round.blackCards : [],
    redScore: showCards ? round.redScore : 0,
    blackScore: showCards ? round.blackScore : 0,
    winningReason: showCards ? round.winningReason : "",
    status: round.status,
    phase: revealing ? "reveal" : round.status === "open" ? "betting" : "settled"
  };
}

function shuffleDeck() {
  const deck = suits.flatMap((suit) => ranks.map((card) => ({ ...card, suit })));

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

function isSequence(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const normal = sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2];
  const aceLow = sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 14;
  return normal || aceLow;
}

function sequenceHigh(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 14 ? 3 : sorted[2];
}

function handScore(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const groups = Object.entries(counts)
    .map(([value, count]) => ({ value: Number(value), count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const flush = cards.every((card) => card.suit === cards[0].suit);
  const sequence = isSequence(values);
  const highSequence = sequenceHigh(values);

  if (groups[0].count === 3) {
    return { score: 6000000 + groups[0].value, label: "Trail" };
  }

  if (flush && sequence) {
    return { score: 5000000 + highSequence, label: "Pure sequence" };
  }

  if (sequence) {
    return { score: 4000000 + highSequence, label: "Sequence" };
  }

  if (flush) {
    return { score: 3000000 + values[0] * 225 + values[1] * 15 + values[2], label: "Color" };
  }

  if (groups[0].count === 2) {
    const pair = groups[0].value;
    const kicker = groups.find((group) => group.count === 1).value;
    return { score: 2000000 + pair * 15 + kicker, label: "Pair" };
  }

  return { score: 1000000 + values[0] * 225 + values[1] * 15 + values[2], label: "High card" };
}

function dealRoundHands() {
  const deck = shuffleDeck();
  const redCards = deck.slice(0, 3);
  const blackCards = deck.slice(3, 6);
  const red = handScore(redCards);
  const black = handScore(blackCards);
  const outcome = red.score >= black.score ? "red" : "black";

  return {
    redCards,
    blackCards,
    outcome,
    redScore: red.score,
    blackScore: black.score,
    winningReason: outcome === "red" ? red.label : black.label
  };
}

export async function ensureCurrentRound() {
  const now = new Date();
  const revealingRound = await Round.findOne({
    status: "settled",
    revealEndsAt: { $gt: now }
  }).sort({ revealEndsAt: -1 });

  if (revealingRound) {
    return revealingRound;
  }

  let current = await Round.findOne({ status: "open", endsAt: { $gt: now } }).sort({
    startsAt: -1
  });

  if (current) {
    return current;
  }

  const latest = await Round.findOne().sort({ roundNumber: -1 });
  if (latest?.status === "open" && latest.endsAt.getTime() <= now.getTime()) {
    await settleExpiredRounds();

    const settledReveal = await Round.findOne({
      status: "settled",
      revealEndsAt: { $gt: new Date() }
    }).sort({ revealEndsAt: -1 });

    if (settledReveal) {
      return settledReveal;
    }
  }

  const startsAt = now;
  const endsAt = new Date(startsAt.getTime() + roundMs);

  try {
    current = await Round.create({
      roundNumber: latest ? latest.roundNumber + 1 : 1,
      startsAt,
      endsAt
    });
  } catch (error) {
    if (error.code === 11000) {
      current = await Round.findOne({ status: "open" }).sort({ startsAt: -1 });
    } else {
      throw error;
    }
  }

  return current;
}

export async function settleExpiredRounds() {
  const now = new Date();
  const expiredRounds = await Round.find({ status: "open", endsAt: { $lte: now } });

  for (const round of expiredRounds) {
    const deal = dealRoundHands();
    const revealEndsAt = new Date(now.getTime() + revealMs);
    const update = await Round.updateOne(
      { _id: round._id, status: "open" },
      {
        $set: {
          outcome: deal.outcome,
          redCards: deal.redCards,
          blackCards: deal.blackCards,
          redScore: deal.redScore,
          blackScore: deal.blackScore,
          winningReason: deal.winningReason,
          revealEndsAt,
          status: "settled"
        }
      }
    );

    if (update.modifiedCount === 0) {
      continue;
    }

    const bets = await Bet.find({ round: round._id, status: "pending" });

    for (const bet of bets) {
      if (bet.color === deal.outcome) {
        bet.status = "won";
        bet.payout = bet.amount * 2;
        await User.findByIdAndUpdate(bet.user, { $inc: { balance: bet.payout } });
      } else {
        bet.status = "lost";
        bet.payout = 0;
      }

      await bet.save();
    }
  }

  return null;
}

export async function getGameState() {
  await settleExpiredRounds();
  const now = new Date();
  const currentRound = await ensureCurrentRound();
  const historyQuery = { status: "settled" };

  if (isRevealing(currentRound, now)) {
    historyQuery._id = { $ne: currentRound._id };
  }

  const history = await Round.find(historyQuery).sort({ endsAt: -1 }).limit(30);

  return {
    serverTime: now,
    roundSeconds: env.roundSeconds,
    revealSeconds: revealMs / 1000,
    currentRound: publicRound(currentRound, now),
    history: history.map((round) => publicRound(round, now))
  };
}

export function startRoundCron() {
  cron.schedule("* * * * * *", async () => {
    try {
      await settleExpiredRounds();
      await ensureCurrentRound();
    } catch (error) {
      console.error("Round cron failed", error);
    }
  });
}
