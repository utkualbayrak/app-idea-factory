import { appendFile } from "node:fs/promises";
import { fetchSettings } from "./lib/api-client";

// Ayarlar ekranından kapatılmış kaynakları SKIP_* env değişkenlerine
// çevirip $GITHUB_ENV'e yazar — collect-trends.ts bunları okuyor.
// $GITHUB_ENV yoksa (yerel çalıştırma) sadece konsola yazar.
const SOURCE_TO_SKIP_VAR: Record<string, string> = {
  source_reddit_enabled: "SKIP_REDDIT",
  source_appstore_enabled: "SKIP_APPSTORE",
  source_producthunt_enabled: "SKIP_PRODUCTHUNT",
  source_hackernews_enabled: "SKIP_HACKERNEWS",
};

async function main() {
  const settings = await fetchSettings();
  const lines: string[] = [];

  for (const [key, skipVar] of Object.entries(SOURCE_TO_SKIP_VAR)) {
    const enabled = settings[key] ?? true;
    lines.push(`${skipVar}=${enabled ? "false" : "true"}`);
  }

  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    await appendFile(githubEnv, lines.join("\n") + "\n", "utf-8");
  }
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
