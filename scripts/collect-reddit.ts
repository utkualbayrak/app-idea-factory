import { readFile } from "node:fs/promises";
import path from "node:path";
import { collectRedditGroups, type SubredditsConfig } from "./lib/reddit";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_PATH = path.join(REPO_ROOT, "config", "subreddits.json");

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf-8")) as SubredditsConfig;
  const sections = await collectRedditGroups(config);
  console.log(JSON.stringify(sections, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
