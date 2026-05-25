import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: process.env.PORT || 3090,
  clientOrigins: (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  mongoUri:
    process.env.MONGO_URI ||
    "mongodb+srv://shahrukh:dilyad11@cluster0.m25ienz.mongodb.net/gaming_bettle",
  roundSeconds: Number(process.env.ROUND_SECONDS || 30),
  startingBalance: Number(process.env.STARTING_BALANCE || 30)
};
