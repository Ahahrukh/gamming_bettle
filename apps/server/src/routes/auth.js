import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";

export const authRouter = express.Router();

function signUser(user) {
  return jwt.sign({ userId: user._id }, env.jwtSecret, { expiresIn: "7d" });
}

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    balance: user.balance
  };
}

authRouter.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: "Name, email and 6 character password required" });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    balance: env.startingBalance
  });

  res.status(201).json({ token: signUser(user), user: serializeUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || "").toLowerCase() });

  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  res.json({ token: signUser(user), user: serializeUser(user) });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});
