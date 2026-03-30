import { Router } from "express";
import { signIn, signUp, updatePassword } from "../controllers/auth.controller";

const authRouter = Router();

authRouter.post("/signup", signUp);
authRouter.post("/signin", signIn);
authRouter.patch("/settings/password", updatePassword);

export default authRouter;
