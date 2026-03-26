import { Router } from "express";
import { cancelOrders, getAccountAssets, getIndexPriceCandles, getOpenOrders, getOpenPositions, submitOrder } from "../controllers/mexc.controller";

const mexcRouter = Router();

mexcRouter.get("/index-price-candles", getIndexPriceCandles);
mexcRouter.get("/account/assets", getAccountAssets);
mexcRouter.get("/position/open", getOpenPositions);
mexcRouter.get("/order/open", getOpenOrders);

mexcRouter.post("/order/submit", submitOrder);
mexcRouter.post("/order/cancel", cancelOrders);

export default mexcRouter;

