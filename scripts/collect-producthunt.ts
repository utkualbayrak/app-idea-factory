import { collectProductHuntSection } from "./lib/producthunt";

async function main() {
  const section = await collectProductHuntSection();
  console.log(JSON.stringify(section, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
