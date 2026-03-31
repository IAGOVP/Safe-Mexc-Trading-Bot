import { Request, Response } from "express";
import {
  confirmCurrentStep,
  createStepPlan,
  getPlan,
  listPlans,
  stopPlan,
  validateStepsPayload
} from "../services/stepPlan.service";

const wrap = <T>(data: T): { success: true; code: number; data: T } => ({
  success: true,
  code: 0,
  data
});

export const postCreateStepPlan = async (req: Request, res: Response): Promise<void> => {
  const v = validateStepsPayload(req.body);
  if (!v.ok) {
    res.status(400).json({ message: v.error });
    return;
  }

  try {
    const plan = createStepPlan({
      symbol: v.symbol,
      openType: v.openType,
      leverage: v.leverage,
      steps: v.steps
    });
    res.status(200).json({ data: wrap(plan) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to create step plan." });
  }
};

export const postConfirmStepPlan = async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  if (!id) {
    res.status(400).json({ message: "plan id is required." });
    return;
  }

  const stepIndexRaw = (req.body as { stepIndex?: number }).stepIndex;
  const stepIndex = stepIndexRaw === undefined ? undefined : Number(stepIndexRaw);

  try {
    const plan = await confirmCurrentStep(id, Number.isFinite(stepIndex) ? stepIndex : undefined);
    res.status(200).json({ data: wrap(plan) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to confirm step." });
  }
};

export const getStepPlans = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ data: wrap(listPlans()) });
};

export const postStopStepPlan = async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  if (!id) {
    res.status(400).json({ message: "plan id is required." });
    return;
  }

  try {
    const plan = await stopPlan(id);
    if (!plan) {
      res.status(404).json({ message: "Plan not found." });
      return;
    }
    res.status(200).json({ data: wrap(plan) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to stop plan." });
  }
};

export const getStepPlan = async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  const plan = id ? getPlan(id) : undefined;
  if (!plan) {
    res.status(404).json({ message: "Plan not found." });
    return;
  }
  res.status(200).json({ data: wrap(plan) });
};
