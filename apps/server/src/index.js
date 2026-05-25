import cors from "cors";
import express from "express";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { gameRouter } from "./routes/game.js";
import { ensureCurrentRound, settleExpiredRounds, startRoundCron } from "./services/roundService.js";

const app = express();

const devOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin) || devOriginPattern.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  }
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, serverTime: new Date() });
});

app.get("/api/cron/settle", async (req, res, next) => {
  try {
    await settleExpiredRounds();
    await ensureCurrentRound();
    res.json({ ok: true, serverTime: new Date() });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRouter);
app.use("/api/game", gameRouter);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong" });
});

await connectDb();
await ensureCurrentRound();

if (!process.env.VERCEL) {
  startRoundCron();

  const server = app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${env.port} is already in use. Stop the old backend process, then run npm run server again.`);
      process.exit(1);
    }

    throw error;
  });
}

export default app;
