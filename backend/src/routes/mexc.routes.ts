import { Router } from "express";
import { cancelOrders, getAccountAssets, getIndexPriceCandles, getOpenPositions, submitOrder } from "../controllers/mexc.controller";

const mexcRouter = Router();

mexcRouter.get("/index-price-candles", getIndexPriceCandles);
mexcRouter.get("/account/assets", getAccountAssets);
mexcRouter.get("/position/open", getOpenPositions);

mexcRouter.post("/order/submit", submitOrder);
mexcRouter.post("/order/cancel", cancelOrders);

export default mexcRouter;

