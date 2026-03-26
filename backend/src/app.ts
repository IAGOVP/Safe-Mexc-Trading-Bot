import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import authRouter from "./routes/auth.routes";
import mexcRouter from "./routes/mexc.routes";

export const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173"
  })
);
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/mexc", mexcRouter);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});
