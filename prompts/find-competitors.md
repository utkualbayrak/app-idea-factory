# Rakip/benzer uygulamaları bul

`scripts/output/idea.json` dosyasındaki fikre bak. Web'de arama yaparak bu fikre en çok benzeyen, **gerçekten var olan** 2-5 uygulama/ürün bul (App Store, Google Play, web uygulamaları, SaaS ürünleri — hepsi geçerli).

Kurallar:

- **Sadece gerçek, doğrulanabilir sonuçlar kullan.** Emin olmadığın veya uydurduğun bir uygulama adı/url'si yazma. Hiç ikna edici bir benzer bulamazsan boş bir dizi döndür — bu da geçerli bir sonuç (piyasada gerçekten boşluk olabilir).
- Her sonuç için: `app_name` (kısa, tanınabilir), `url` (varsa gerçek bir link — App Store/Play Store/resmi site), `note` (Türkçe, 1 kısa cümle: ne kadar benzediği veya bu fikirden farkı ne).
- En alakalı sonuçları önce sırala.

Çıktıyı tam olarak aşağıdaki şemaya uyan bir JSON **dizisi** olarak **`scripts/output/competitors.json`** dosyasına yaz. Dosyada başka hiçbir şey olmasın — açıklama, markdown, yorum yok, sadece geçerli JSON (boş sonuç için `[]`):

```json
[
  { "app_name": "string", "url": "string (url, opsiyonel)", "note": "string (Türkçe)" }
]
```
