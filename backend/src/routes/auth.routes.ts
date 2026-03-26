import { Router } from "express";
import { signIn, signUp, updateKeys } from "../controllers/auth.controller";

const authRouter = Router();

authRouter.post("/signup", signUp);
authRouter.post("/signin", signIn);
authRouter.patch("/settings/mexc-keys", updateKeys);

export default authRouter;
