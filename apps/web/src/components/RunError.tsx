// Çalışma geçmişi kayıtlarının hata alanı.
// error: düz bir sebep, düz bir log URL'si ya da "sebep | URL"
// (finish-cron-run.ts, failure-reason.txt varsa sebebi log linkinin önüne ekler).
export function RunError({ error }: { error: string }) {
  const [reason, url] = error.startsWith("http") ? ["", error] : error.split(" | ");
  return (
    <>
      {reason}
      {reason && url && " — "}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          Çalışma loglarını gör
        </a>
      )}
    </>
  );
}
