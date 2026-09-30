import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { collectRedditGroups, type SubredditsConfig } from "./lib/reddit";
import { collectAppStoreSection } from "./lib/appstore";
import { collectProductHuntSection } from "./lib/producthunt";
import { collectHackerNewsSection } from "./lib/hackernews";
import { fetchLatestSnapshot } from "./lib/api-client";
import type { SourceSection, TrendSummary } from "./lib/types";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_PATH = path.join(REPO_ROOT, "config", "subreddits.json");
const DEFAULT_OUT_PATH = path.join(REPO_ROOT, "scripts", "output", `trend-summary.${todayDate()}.json`);

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Ayarlar ekranından kapatılmış bir kaynak için: boş ama geçerli bir bölüm
// (error değil — kapatılmış olmak bir hata değil, bilinçli bir tercih).
function emptySection(source: string, label: string): SourceSection {
  return { source, label, fetchedAt: new Date().toISOString(), items: [] };
}

// notes.txt madde 13: App Store gibi zaman içinde az değişen kaynaklar için
// son 24 saat içinde toplanmış bir trend_snapshots kaydı varsa onu yeniden
// kullan, tekrar çekme. API'ye erişilemiyorsa (yerel çalıştırma, eksik env
// vb.) sessizce normal akışa düş — bu saf bir optimizasyon, zorunlu değil.
async function tryReuseRecentSnapshot(source: string): Promise<SourceSection | null> {
  try {
    const snapshot = await fetchLatestSnapshot(source);
    return (snapshot?.payload as SourceSection | undefined) ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const outPath = process.argv[2] ?? DEFAULT_OUT_PATH;

  const config = JSON.parse(await readFile(CONFIG_PATH, "utf-8")) as SubredditsConfig;

  // Reddit'in .rss fallback'i rate-limit backoff'u yuzunden yavas (bkz.
  // docs/PROJE.md); test/debug icin veya Ayarlar ekranindan kaynak
  // kapatilinca (bkz. scripts/fetch-settings.ts) SKIP_* ile atlanabilir.
  const skipReddit = process.env.SKIP_REDDIT === "true";
  console.log(skipReddit ? "Reddit atlaniyor (SKIP_REDDIT=true)..." : "Reddit toplaniyor...");
  const redditSections = skipReddit ? [] : await collectRedditGroups(config);

  const skipAppStore = process.env.SKIP_APPSTORE === "true";
  const reusedAppStore = skipAppStore ? null : await tryReuseRecentSnapshot("appstore");
  let appStoreSection: SourceSection;
  if (skipAppStore) {
    console.log("App Store atlaniyor (SKIP_APPSTORE=true)...");
    appStoreSection = emptySection("appstore", "App Store top charts (US, TR)");
  } else if (reusedAppStore) {
    console.log("App Store son 24 saat icinde toplanmis, trend_snapshots'tan yeniden kullaniliyor...");
    appStoreSection = reusedAppStore;
  } else {
    console.log("App Store toplaniyor...");
    appStoreSection = await collectAppStoreSection().catch((err) => ({
      source: "appstore",
      label: "App Store top charts (US, TR)",
      fetchedAt: new Date().toISOString(),
      items: [],
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  const skipProductHunt = process.env.SKIP_PRODUCTHUNT === "true";
  console.log(skipProductHunt ? "Product Hunt atlaniyor (SKIP_PRODUCTHUNT=true)..." : "Product Hunt toplaniyor...");
  const productHuntSection = skipProductHunt
    ? emptySection("producthunt", "Product Hunt")
    : await collectProductHuntSection();

  const skipHackerNews = process.env.SKIP_HACKERNEWS === "true";
  console.log(skipHackerNews ? "Hacker News atlaniyor (SKIP_HACKERNEWS=true)..." : "Hacker News toplaniyor...");
  const hackerNewsSection = skipHackerNews
    ? emptySection("hackernews", "Hacker News (Ask HN + arama)")
    : await collectHackerNewsSection().catch((err) => ({
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
