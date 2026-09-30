export interface TrendItem {
  title: string;
  summary: string;
  url: string;
  score?: number;
  meta?: string;
}

export interface SourceSection {
  source: string;
  label: string;
  fetchedAt: string;
  items: TrendItem[];
  error?: string;
}

export interface TrendSummary {
  generatedAt: string;
  sections: SourceSection[];
}
