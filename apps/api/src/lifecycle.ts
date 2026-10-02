import { toUtcIso } from "./db";

// Faz 3 sonrası tur: geliştirme raporları (Grup 3) ve test turları (Grup 4).

export interface DevReportRow {
  id: string;
  idea_id: string;
  round: number;
  created_at: string;
  updated_at: string;
  roadmap_source: string | null;
  roadmap_items: string;
  missing_features: string;
  extra_features: string;
  notes: string;
}

export function serializeDevReport(row: DevReportRow) {
  return {
    id: row.id,
    idea_id: row.idea_id,
    round: row.round,
    created_at: toUtcIso(row.created_at),
    updated_at: toUtcIso(row.updated_at),
    roadmap_source: row.roadmap_source,
    roadmap_items: JSON.parse(row.roadmap_items) as { phase: string | null; text: string; done: boolean }[],
    missing_features: JSON.parse(row.missing_features) as string[],
    extra_features: JSON.parse(row.extra_features) as string[],
    notes: JSON.parse(row.notes) as string[],
  };
}
