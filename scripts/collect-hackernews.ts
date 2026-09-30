import { collectHackerNewsSection } from "./lib/hackernews";

async function main() {
  const section = await collectHackerNewsSection();
  console.log(JSON.stringify(section, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
