import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchRecentNames } from "./lib/api-client";

async function main() {
  const outPath = process.argv[2];
  const days = process.argv[3] ? Number(process.argv[3]) : 90;

  const names = await fetchRecentNames(days);
  const json = JSON.stringify({ names }, null, 2);

  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf-8");
    console.log(`Yazildi: ${outPath} (${names.length} isim, son ${days} gun)`);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
