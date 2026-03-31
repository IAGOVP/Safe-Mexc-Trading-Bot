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
import {
  getStepPlan,
  getStepPlans,
  postConfirmStepPlan,
  postCreateStepPlan,
  postStopStepPlan
} from "../controllers/stepPlan.controller";

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

binanceRouter.post("/steps/plan", postCreateStepPlan);
binanceRouter.post("/steps/start", postCreateStepPlan);
binanceRouter.get("/steps/plans", getStepPlans);
binanceRouter.get("/steps/plans/:id", getStepPlan);
binanceRouter.post("/steps/plans/:id/confirm", postConfirmStepPlan);
binanceRouter.post("/steps/plans/:id/stop", postStopStepPlan);

export default binanceRouter;
