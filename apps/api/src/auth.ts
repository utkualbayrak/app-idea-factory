import type { NextFunction, Request, Response } from "express";
import { env } from "cloudflare:workers";

interface SecretEnv {
  WORKFLOW_API_SHARED_SECRET: string;
}

// docs/PROJE.md: "Workflow'un çağırdığı uçlar paylaşılan bir gizli anahtarla korunur."
export function requireWorkflowSecret(req: Request, res: Response, next: NextFunction) {
  const { WORKFLOW_API_SHARED_SECRET } = env as unknown as SecretEnv;
  const provided = req.header("X-Workflow-Secret");

  if (!provided || provided !== WORKFLOW_API_SHARED_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  next();
}
