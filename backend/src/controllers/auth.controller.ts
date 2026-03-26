import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Account } from "../models/Account.model";

const sanitizeAccount = (account: {
  _id: unknown;
  email: string;
  mexcAPIKey: string;
  mexcSecretKey: string;
}) => ({
  id: String(account._id),
  email: account.email,
  mexcAPIKey: account.mexcAPIKey,
  mexcSecretKey: account.mexcSecretKey
});

export const signUp = async (req: Request, res: Response): Promise<void> => {
  const { email, password, confirmPassword } = req.body as {
    email?: string;
    password?: string;
    confirmPassword?: string;
  };

  if (!email || !password || !confirmPassword) {
    res.status(400).json({ message: "Email, password, and confirm password are required." });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ message: "Password and confirm password do not match." });
    return;
  }

  const existing = await Account.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409).json({ message: "Email already registered." });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const account = await Account.create({
    email,
    password: hashedPassword,
    mexcAPIKey: "",
    mexcSecretKey: ""
  });

  res.status(201).json({ account: sanitizeAccount(account) });
};

export const signIn = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required." });
    return;
  }

  const account = await Account.findOne({ email: email.toLowerCase() });
  if (!account) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const isMatch = await bcrypt.compare(password, account.password);
  if (!isMatch) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  res.status(200).json({ account: sanitizeAccount(account) });
};

export const updateKeys = async (req: Request, res: Response): Promise<void> => {
  const { email, mexcAPIKey, mexcSecretKey } = req.body as {
    email?: string;
    mexcAPIKey?: string;
    mexcSecretKey?: string;
  };

  if (!email) {
    res.status(400).json({ message: "Email is required." });
    return;
  }

  const account = await Account.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      mexcAPIKey: mexcAPIKey ?? "",
      mexcSecretKey: mexcSecretKey ?? ""
    },
    { new: true }
  );

  if (!account) {
    res.status(404).json({ message: "Account not found." });
    return;
  }

  res.status(200).json({ account: sanitizeAccount(account) });
};

export const updatePassword = async (req: Request, res: Response): Promise<void> => {
  const { email, currentPassword, newPassword, confirmNewPassword } = req.body as {
    email?: string;
    currentPassword?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  };

  if (!email || !currentPassword || !newPassword || !confirmNewPassword) {
    res.status(400).json({ message: "Email, current password, new password, and confirm password are required." });
    return;
  }

  if (newPassword !== confirmNewPassword) {
    res.status(400).json({ message: "New password and confirm password do not match." });
    return;
  }

  const account = await Account.findOne({ email: email.toLowerCase() });
  if (!account) {
    res.status(404).json({ message: "Account not found." });
    return;
  }

  const isMatch = await bcrypt.compare(currentPassword, account.password);
  if (!isMatch) {
    res.status(401).json({ message: "Current password is incorrect." });
    return;
  }

  account.password = await bcrypt.hash(newPassword, 10);
  await account.save();

  res.status(200).json({ account: sanitizeAccount(account) });
};
