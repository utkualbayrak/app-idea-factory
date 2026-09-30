import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { collectRedditGroups, type SubredditsConfig } from "./lib/reddit";
import { collectAppStoreSection } from "./lib/appstore";
import { collectProductHuntSection } from "./lib/producthunt";
import { collectHackerNewsSection } from "./lib/hackernews";
import type { TrendSummary } from "./lib/types";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_PATH = path.join(REPO_ROOT, "config", "subreddits.json");
const DEFAULT_OUT_PATH = path.join(REPO_ROOT, "scripts", "output", `trend-summary.${todayDate()}.json`);

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const outPath = process.argv[2] ?? DEFAULT_OUT_PATH;

  const config = JSON.parse(await readFile(CONFIG_PATH, "utf-8")) as SubredditsConfig;

  console.log("Reddit toplaniyor...");
  const redditSections = await collectRedditGroups(config);

  console.log("App Store toplaniyor...");
  const appStoreSection = await collectAppStoreSection().catch((err) => ({
    source: "appstore",
    label: "App Store top charts (US, TR)",
    fetchedAt: new Date().toISOString(),
    items: [],
    error: err instanceof Error ? err.message : String(err),
  }));

  console.log("Product Hunt toplaniyor...");
  const productHuntSection = await collectProductHuntSection();

  console.log("Hacker News toplaniyor...");
  const hackerNewsSection = await collectHackerNewsSection().catch((err) => ({
    source: "hackernews",
    label: "Hacker News (Ask HN + arama)",
    fetchedAt: new Date().toISOString(),
    items: [],
    error: err instanceof Error ? err.message : String(err),
  }));

  const summary: TrendSummary = {
    generatedAt: new Date().toISOString(),
    sections: [...redditSections, appStoreSection, productHuntSection, hackerNewsSection],
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log(`\nYazildi: ${outPath}\n`);
  for (const section of summary.sections) {
    const status = section.error ? ` (uyari: ${section.error})` : "";
    console.log(`- ${section.source}: ${section.items.length} oge${status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
