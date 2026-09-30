import express from "express";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { requireWorkflowSecret } from "./auth";
import { serializeIdea, type IdeaRow } from "./db";
import { ideaBatchRequestSchema, ideaPatchSchema } from "./schema";

interface Env {
  DB: D1Database;
}

const app = express();
app.use(express.json());

function db() {
  return (env as unknown as Env).DB;
}

app.get("/health", async (_req, res) => {
  const result = await db().prepare("SELECT 1 AS ok").first<{ ok: number }>();
  res.json({ status: "ok", db: result?.ok === 1 });
});

app.get("/ideas", async (req, res) => {
  const batchDate = typeof req.query.batch_date === "string" ? req.query.batch_date : undefined;

  const { results } = batchDate
    ? await db()
        .prepare("SELECT * FROM ideas WHERE batch_date = ?1 ORDER BY created_at DESC")
        .bind(batchDate)
        .all<IdeaRow>()
    : await db().prepare("SELECT * FROM ideas ORDER BY created_at DESC").all<IdeaRow>();

  res.json({ ideas: results.map(serializeIdea) });
});

app.get("/ideas/recent-names", requireWorkflowSecret, async (req, res) => {
  const days = Number(req.query.days ?? 90);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 90;

  const { results } = await db()
    .prepare(
      `SELECT DISTINCT name FROM ideas WHERE created_at >= datetime('now', ?1)`,
    )
    .bind(`-${safeDays} days`)
    .all<{ name: string }>();

  res.json({ names: results.map((row) => row.name) });
});

app.get("/ideas/:id", async (req, res) => {
  const row = await db()
    .prepare("SELECT * FROM ideas WHERE id = ?1")
    .bind(req.params.id)
    .first<IdeaRow>();

  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({ idea: serializeIdea(row) });
});

app.post("/ideas/batch", requireWorkflowSecret, async (req, res) => {
  const parsed = ideaBatchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { batch_date, ideas } = parsed.data;
  const now = new Date().toISOString();

  const statements = ideas.map((idea) =>
    db()
      .prepare(
        `INSERT INTO ideas
          (id, created_at, batch_date, name, one_liner, problem, target_audience,
           core_features, monetization, category, inspiration_source, scores, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'new')`,
      )
      .bind(
        crypto.randomUUID(),
        now,
        batch_date,
        idea.name,
        idea.one_liner,
        idea.problem,
        idea.target_audience,
        JSON.stringify(idea.core_features),
        idea.monetization,
        idea.category,
        idea.inspiration_source,
        JSON.stringify(idea.scores),
      ),
  );

  await db().batch(statements);

  const { results } = await db()
    .prepare("SELECT * FROM ideas WHERE batch_date = ?1 ORDER BY created_at DESC LIMIT ?2")
    .bind(batch_date, ideas.length)
    .all<IdeaRow>();

  res.status(201).json({ ideas: results.map(serializeIdea) });
});

app.patch("/ideas/:id", async (req, res) => {
  const parsed = ideaPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const existing = await db()
    .prepare("SELECT * FROM ideas WHERE id = ?1")
    .bind(req.params.id)
    .first<IdeaRow>();

  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const next = { ...existing, ...parsed.data };

  await db()
    .prepare(
      `UPDATE ideas SET user_rating = ?1, user_note = ?2, status = ?3 WHERE id = ?4`,
    )
    .bind(next.user_rating ?? null, next.user_note ?? null, next.status, req.params.id)
    .run();

  res.json({ idea: serializeIdea(next as IdeaRow) });
});

export default app;
