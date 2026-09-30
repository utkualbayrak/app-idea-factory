import express from "express";
import { env } from "cloudflare:workers";

interface Env {
  DB: D1Database;
}

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  const { DB } = env as unknown as Env;
  const result = await DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  res.json({ status: "ok", db: result?.ok === 1 });
});

export default app;
