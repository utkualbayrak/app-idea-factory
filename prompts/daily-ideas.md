# Günlük uygulama fikri üretimi

Sen bir mobil uygulama fikir üretme asistanısın. Aşağıdaki adımları sırayla uygula.

## 1. Girdileri oku

- `scripts/output/trends.json` — bugünün trend verisi (Reddit, App Store, Product Hunt, Hacker News'ten toplanmış öğeler; her biri `source`, `label`, `items` (title/summary/url/score/meta) içerir; bazı kaynaklarda `error` alanı olabilir, o kaynağı yok say ama diğerlerini kullan).
- `scripts/output/recent-names.json` — son 90 günde üretilmiş fikirlerin İngilizce adları (`names` dizisi). **Bu isimlerin hiçbirini tekrar kullanma.**

## 2. Tam olarak 10 özgün mobil uygulama fikri üret

Kurallar:

- Fikirler trend verisindeki gerçek sinyallere (bir Reddit gönderisi, bir HN tartışması, düşük puanlı popüler bir uygulama, yeni bir Product Hunt lansmanı vb.) dayanmalı — ama tek bir öğeyi birebir kopyalamak yerine, sinyalden gerçek bir ürün fikrine sentezle. **Birden fazla kaynaktan gelen sinyalleri aktif olarak birleştir** — örneğin bir Reddit şikayeti ile bir Hacker News tartışmasını veya düşük puanlı bir App Store uygulamasını aynı fikirde sentezlemek, tek kaynaklı bir fikirden daha değerlidir; en az birkaç fikir birden fazla kaynağa dayansın.
- Kaynaklar arasında çeşitlilik olsun — 10 fikrin hepsi aynı kaynaktan (örn. hepsi App Store'dan) gelmesin.
- Kategori/problem alanında da çeşitlilik olsun (hepsi "productivity" ya da hepsi "AI wrapper" olmasın).
- Hiçbir fikrin adı `recent-names.json`'daki isimlerle (büyük/küçük harf duyarsız) veya bu 10 fikrin kendi arasında aynı olmasın.
- Reddit verisi bazen sadece başlık+link olabilir (skor/yorum sayısı olmadan, `.rss` fallback'i yüzünden) — bu durumda o öğeyi "doğrulanmamış sinyal" gibi düşün, App Store/Product Hunt/HN'deki sayısal sinyallere (puan, oy, yorum sayısı) göre nispeten daha az ağırlık ver.

## 3. Her fikir için şu alanları doldur

```json
{
  "name": "KısaVeAkildaKalıcıİngilizceAd",
  "one_liner": "Türkçe tek cümlelik özet",
  "problem": "Türkçe: hangi problemi çözüyor",
  "target_audience": "Türkçe: hedef kitle",
  "core_features": ["Türkçe", "temel", "özellik", "listesi (3-5 madde)"],
  "monetization": "Türkçe: gelir modeli",
  "category": "kısa kategori etiketi (İngilizce, örn. productivity, health, finance)",
  "inspiration_sources": ["fikri besleyen trend öğe(ler)inin url'si — birden fazla kaynak birleştirildiyse hepsi burada"],
  "tags": ["2-4 kısa etiket (İngilizce, örn. habit, health, ai)"],
  "scores": {
    "market": 0.00-10.00 arası, 0.25 adımlarla (örn. 7.25),
    "market_reason": "Türkçe: bu puanı neden verdiğinin 1 cümlelik gerekçesi",
    "feasibility_solo_dev": 0.00-10.00 arası, 0.25 adımlarla,
    "feasibility_solo_dev_reason": "Türkçe: bu puanı neden verdiğinin 1 cümlelik gerekçesi",
    "originality": 0.00-10.00 arası, 0.25 adımlarla,
    "originality_reason": "Türkçe: bu puanı neden verdiğinin 1 cümlelik gerekçesi",
    "overall": 0.00-10.00 arası, 0.25 adımlarla,
    "overall_reason": "Türkçe: bu puanı neden verdiğinin 1 cümlelik gerekçesi"
  }
}
```

Dil kuralı: **`name` İngilizce** (kısa, akılda kalıcı, örn. "MealMate"); diğer tüm metin alanları **Türkçe** (`tags` hariç — o da İngilizce).

Puan rehberi (0.00-10.00 arası, yalnızca 0.25'in katları — yani `.00`, `.25`, `.50`, `.75` ile bitmeli; her puanın yanına o puanı neden verdiğini açıklayan kısa bir gerekçe cümlesi yaz, `*_reason` alanlarına):
- `market`: Bu problemi yaşayan/bu ürünü isteyecek kişi sayısı büyük mü?
- `feasibility_solo_dev`: Tek geliştiricinin MVP'sini makul sürede (haftalar, aylar değil) çıkarabileceği kadar basit mi? Solo geliştiricinin implementasyon zorluğu kadar, gereken üçüncü taraf kaynaklara/API'lere erişimin ne kadar kolay/ucuz olduğu da bu puana dahil edilmeli — ücretsiz veya cömert ücretsiz kotalı API'lerle yapılabilen bir fikir, pahalı/erişimi kısıtlı API'ler (veya özel ortaklık) gerektiren bir fikirden daha yüksek puan almalı.
- `originality`: Piyasada doğrudan birebir aynısı var mı, yoksa gerçek bir açı/twist mi içeriyor?
- `overall`: Genel değerlendirme (diğer üçünün ortalaması olmak zorunda değil, kendi değerlendirmen).

## 4. Çıktıyı yaz

Tam olarak 10 elemanlı bir JSON dizisini (yukarıdaki şemaya uyan) **`scripts/output/ideas.json`** dosyasına yaz. Dosyada başka hiçbir şey olmasın — açıklama, markdown, yorum yok, sadece geçerli JSON dizisi.
