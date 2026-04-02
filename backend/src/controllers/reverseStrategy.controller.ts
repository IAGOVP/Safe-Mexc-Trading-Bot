import { Request, Response } from "express";
import {
  getReverseRunDtoById,
  listReverseRunsDto,
  milestonesForVariant,
  startReverseStrategy,
  stopReverseStrategy,
  type ReverseStrategyVariant
} from "../services/reverseStrategy.service";

const wrap = <T>(data: T): { success: true; code: number; data: T } => ({
  success: true,
  code: 0,
  data
});

export const postStartReverseStrategy = async (req: Request, res: Response): Promise<void> => {
  const { symbol, openType, variant, bootstrap, leverage, startMarginUsdt } = req.body as {
    symbol?: string;
    openType?: number;
    variant?: string;
    bootstrap?: boolean;
    leverage?: number;
    startMarginUsdt?: number;
  };

  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ message: "symbol is required." });
    return;
  }
  if (openType !== 1 && openType !== 2) {
    res.status(400).json({ message: "openType must be 1 (isolated) or 2 (cross)." });
    return;
  }
  if (variant !== "200" && variant !== "300") {
    res.status(400).json({ message: 'variant must be "200" or "300".' });
    return;
  }

  try {
    const run = await startReverseStrategy({
      symbol,
      openType,
      variant: variant as ReverseStrategyVariant,
      bootstrap: bootstrap === true,
      leverage,
      startMarginUsdt
    });
    res.status(200).json({ data: wrap(run) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to start reverse strategy." });
  }
};

export const getReverseStrategies = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ data: wrap(listReverseRunsDto()) });
};

export const getReverseStrategyById = async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  if (!id) {
    res.status(400).json({ message: "id is required." });
    return;
  }
  const run = getReverseRunDtoById(id);
  if (!run) {
    res.status(404).json({ message: "Reverse strategy run not found." });
    return;
  }
  res.status(200).json({ data: wrap(run) });
};

export const getReverseStrategyMilestones = async (req: Request, res: Response): Promise<void> => {
  const v = req.query.variant as string | undefined;
  if (v !== "200" && v !== "300") {
    res.status(400).json({ message: 'query variant must be "200" or "300".' });
    return;
  }
  res.status(200).json({ data: wrap(milestonesForVariant(v)) });
};

export const postStopReverseStrategy = async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  if (!id) {
    res.status(400).json({ message: "id is required." });
    return;
  }
  const run = stopReverseStrategy(id);
  if (!run) {
    res.status(404).json({ message: "Reverse strategy run not found." });
    return;
  }
  res.status(200).json({ data: wrap(run) });
};
