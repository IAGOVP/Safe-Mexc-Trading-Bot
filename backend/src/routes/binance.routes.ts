import { Router } from "express";
import {
  cancelOrders,
  getAccountAssets,
  getBookTicker,
  getMarkPriceCandles,
  getOpenOrders,
  getOpenPositions,
  submitAlgoVpOrder,
  submitOrder,
  submitTriggerOrder
} from "../controllers/binance.controller";

const binanceRouter = Router();

binanceRouter.get("/mark-price-candles", getMarkPriceCandles);
binanceRouter.get("/book-ticker", getBookTicker);
binanceRouter.get("/account/assets", getAccountAssets);
binanceRouter.get("/position/open", getOpenPositions);
binanceRouter.get("/order/open", getOpenOrders);

binanceRouter.post("/order/submit", submitOrder);
binanceRouter.post("/order/submit-trigger", submitTriggerOrder);
binanceRouter.post("/algo/vp-order", submitAlgoVpOrder);
binanceRouter.post("/order/cancel", cancelOrders);

export default binanceRouter;
