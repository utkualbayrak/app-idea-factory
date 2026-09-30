// Web Worker'ın kendi fetch handler'ı: /api/* isteklerini sunucu tarafında
// (service binding ile, tarayıcıdan hiç geçmeden) API Worker'a proxy'ler.
// Boylece tarayıcı tek bir origin/hostname görür (ideas.utkualbayrak.dev),
// tek Access girişi yeterli olur — ayrı bir API domain'ine ayrıca giriş
// yapma ya da üçüncü-taraf çerez sorunu olmaz. Bkz. CLAUDE.md "Faz 2".
export interface Env {
  ASSETS: Fetcher;
  API: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const apiUrl = new URL(request.url);
      apiUrl.pathname = apiUrl.pathname.replace(/^\/api/, "") || "/";
      return env.API.fetch(new Request(apiUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
