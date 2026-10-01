# Rakip/benzer uygulamaları bul

`scripts/output/idea.json` dosyasındaki fikre bak. Web'de arama yaparak bu fikre en çok benzeyen, **gerçekten var olan** en fazla 5 uygulama/ürün bul (App Store, Google Play, web uygulamaları, SaaS ürünleri — hepsi geçerli).

## 1. Girdiyi oku

- `scripts/output/idea.json` dosyasını oku. Özellikle `problem`, `one_liner`, `core_features`, `target_audience` ve `category` alanlarını kullan.
- Dosya yoksa, okunamıyorsa veya geçerli JSON değilse: hiçbir arama yapma, çıktıya `{ "status": "input_error", "competitors": [] }` yaz ve dur.

## 2. Arama stratejisi

- Fikrin `name` alanıyla arama yapma; bu yeni üretilmiş bir isimdir ve sonuç vermez.
- Bunun yerine problemi ve temel özellikleri anahtar kelimelere çevir. Sorguları **İngilizce** yaz.
- Farklı açılardan en az **4 farklı sorgu** dene. Örnek kalıplar:
  - `<problem> app`
  - `best <kategori/özellik> app`
  - `<bilinen bir ürün> alternative`
  - `<özellik> iOS app` / `<özellik> Android app`
  - `<problem> SaaS` (web tabanlı çözümler için)
- Umut verici bir aday bulduğunda, gerçekten var olduğunu ve fikre benzediğini teyit etmek için sayfasını aç (App Store sayfası, Play Store sayfası veya resmi site).
- Arama aracı hiç çalışmazsa veya tüm aramalar hata verirse: çıktıya `{ "status": "search_failed", "competitors": [] }` yaz ve dur. Bu durumu asla "rakip yok" olarak raporlama.

## 3. Doğrulama kuralları

- **`url` yalnızca bu oturumdaki arama sonuçlarında veya açtığın sayfalarda birebir geçen bir link olabilir.** App Store/Play Store ID'si, paket adı veya domain tahmin etme; bir linki kendin oluşturma ya da değiştirme.
- Gerçek bir link bulamadığın uygulamayı listeye ekleme. Hafızandan bildiğin bir uygulama bile olsa, bu oturumda linkini doğrulayamadıysan dahil etme.
- Aynı uygulamanın iOS, Android ve web sürümleri **tek giriş** sayılır. Link olarak öncelik sırası: resmi site → App Store → Play Store.
- Kapanmış, mağazadan kaldırılmış veya sayfasında belirgin şekilde terk edilmiş görünen ürünleri dahil etme. Yaşayıp yaşamadığından emin değilsen dahil edebilirsin ama bunu `note`'ta belirt.

## 4. Benzerlik tanımı

Her sonuç için bir `similarity` değeri seç:

- `direct`: Aynı problemi aynı hedef kitle için büyük ölçüde aynı yaklaşımla çözüyor.
- `partial`: Problemin bir kısmını çözüyor veya aynı problemi farklı bir kitle/yaklaşımla ele alıyor.
- `alternative`: Bu problem için özel yapılmamış ama insanların bugün bu iş için kullandığı genel bir araç (örn. Notion, Google Sheets, bir not uygulaması). Bu tipten **en fazla 1** sonuç ekle; yalnızca gerçekten yaygın bir alternatifse.

Sıralama: önce tüm `direct`, sonra `partial`, en son `alternative`. Aynı grup içinde en benzer olan önce gelsin.

## 5. Not yazma kuralları

`note` alanı Türkçe, 1–2 kısa cümle olsun ve şunları içersin:

- Bu fikirden **temel farkı** (veya `direct` ise neyi aynı yaptığı ve fikrin nerede ayrışabileceği).
- Biliniyorsa fiyat modeli (ücretsiz, freemium, abonelik, tek seferlik ödeme).

"Benzer bir uygulama." veya "Bu da bir takip uygulaması." gibi bilgi taşımayan notlar yazma.

## 6. Boş sonuç

Yeterli sayıda (en az 4) farklı sorgu denedin ve doğrulanmış, ikna edici bir benzer bulamadıysan, `status: "ok"` ile boş `competitors` dizisi döndür. Bu geçerli bir sonuçtur; piyasada gerçekten boşluk olabilir. Listeyi doldurmak için zayıf veya alakasız sonuç ekleme.

## 7. Çıktı şeması

Çıktı, aşağıdaki şemaya uyan tek bir JSON **nesnesi**dir:

```json
{
  "status": "ok",
  "competitors": [
    {
      "app_name": "string",
      "url": "string",
      "similarity": "direct",
      "note": "string"
    }
  ]
}
```

Alan kuralları:

- `status`: `"ok"`, `"search_failed"` veya `"input_error"` değerlerinden biri.
- `competitors`: 0–5 elemanlı dizi. `status` `"ok"` değilse her zaman boş dizi.
- `app_name`: Kısa, tanınabilir ürün adı (mağazadaki uzun alt başlıklar olmadan; örn. "Todoist", "Todoist: To-Do List & Planner" değil).
- `url`: Zorunlu. 3. bölümdeki kurallara uyan, `https://` ile başlayan gerçek bir link.
- `similarity`: `"direct"`, `"partial"` veya `"alternative"` değerlerinden biri.
- `note`: Zorunlu, Türkçe.

Örnek (yalnızca format referansı; içeriği kopyalama):

```json
{
  "status": "ok",
  "competitors": [
    {
      "app_name": "ExampleApp",
      "url": "https://apps.apple.com/us/app/exampleapp/id0000000000",
      "similarity": "direct",
      "note": "Aynı şekilde fişten garanti takibi yapıyor ancak OCR'ı bulutta çalıştırıyor; aylık abonelikle sunuluyor."
    },
    {
      "app_name": "Google Sheets",
      "url": "https://www.google.com/sheets/about/",
      "similarity": "alternative",
      "note": "Birçok kişi garantileri elle tablo halinde takip ediyor; ücretsiz ama hatırlatma ve otomatik veri çıkarma yok."
    }
  ]
}
```

## 8. Çıktıyı yaz

- JSON nesnesini **`scripts/output/competitors.json`** dosyasına UTF-8 olarak yaz.
- Dosyada başka hiçbir şey olmasın: açıklama, markdown, kod bloğu işareti veya yorum yok; yalnızca geçerli JSON.
- Yazdıktan sonra dosyayı tekrar oku ve kontrol et:
  - Geçerli JSON mı ve şemaya uyuyor mu?
  - `competitors` 0–5 eleman mı; `status` `"ok"` değilse boş mu?
  - Her `url` bu oturumdaki arama sonuçlarında veya açtığın sayfalarda birebir geçiyor mu?
  - Aynı ürün birden fazla kez listelenmiş mi?
  - Sıralama `direct` → `partial` → `alternative` şeklinde mi?
- Bir sorun varsa düzelt ve dosyayı yeniden yaz.