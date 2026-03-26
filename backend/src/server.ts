import dotenv from "dotenv";
import { app } from "./app";
import { connectDatabase } from "./config/database";

dotenv.config();

const port = Number(process.env.PORT ?? 5000);
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is missing.");
}

const start = async (): Promise<void> => {
  await connectDatabase(mongoUri);
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
