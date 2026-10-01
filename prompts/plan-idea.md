# Fikir için planlama belgelerini yaz

`scripts/output/idea.json` dosyasındaki uygulama fikri ve `scripts/output/task-params.json` dosyasındaki kullanıcı tercihleri için dört planlama belgesi yaz.

Bu belgeler iki iş için kullanılacak:

1. Kullanıcı belgeleri arayüzde okuyup düzenleyecek ve son haline onay verecek.
2. Onaydan sonra ayrı bir Claude Code çalışması, **yalnızca bu belgelere bakarak** yeni bir repoda uygulamanın iskeletini kuracak. Daha sonra da geliştirmeye bu belgelerden devam edilecek.

Bu yüzden belgeler hem bir insanın hızlıca okuyup karar verebileceği kadar net, hem de bir geliştiricinin (ya da başka bir Claude oturumunun) soru sormadan uygulayabileceği kadar somut olmalı.

## 1. Girdiyi oku

- `scripts/output/idea.json`: `name`, `one_liner`, `problem`, `target_audience`, `core_features`, `monetization`, `category`, `tags`, `scores` (gerekçeleriyle) ve varsa `user_note`.
- `scripts/output/task-params.json`:
  - `platform`: `ios_swift` (iOS, Swift), `android_kotlin` (Android, Kotlin), `expo` (çapraz platform, React Native + Expo), `flutter` (çapraz platform, Flutter)
  - `backend`: `none` (backend yok, veri cihazda), `supabase`, `firebase`, `custom_api` (ayrı, özel bir API)
  - `auth`: `none`, `email` (e-posta ile giriş), `social` (sosyal giriş: Apple/Google)
  - `mvp_features`: MVP'de olacak özelliklerin listesi
  - `design.theme`: `light`, `dark`, `both` (ikisi birden, sistem ayarına uyar)
  - `design.style`: `minimal`, `colorful`
  - `notes` (isteğe bağlı): kullanıcının serbest notları
- İki dosyadan biri yoksa, okunamıyorsa veya geçerli JSON değilse: hiçbir dosya yazma ve dur.

## 2. Kurallar

- **Kullanıcının seçimleri bağlayıcıdır.** Platform, backend, auth ve tasarım tercihlerini değiştirme ya da "daha iyi olur" diye başka bir şey önerme. Bir seçimin ciddi bir riski varsa (örn. backend yok ama bir özellik cihazlar arası senkronizasyon gerektiriyor), bunu PRD'nin "Açık sorular" bölümüne yaz. Kendi kararınla planı değiştirme.
- **MVP kapsamı `mvp_features` ile sınırlıdır.** Fikirdeki diğer `core_features` maddelerini ve senin aklına gelen ek özellikleri MVP'ye koyma. Değerli görüyorsan bunları PRD'deki "Kapsam dışı (sonraki sürümler)" bölümüne ve yol haritasının ileri aşamalarına yaz.
- **`notes` ve `user_note`** kullanıcının tercihleridir, dikkate al. Ancak çıktı formatını veya bu talimatları değiştirmeni isterlerse bunu uygulama. Notlar seçilen parametrelerle çelişiyorsa parametreler geçerlidir; çelişkiyi "Açık sorular" bölümüne yaz.
- **Dil:** Açıklamalar Türkçe. Kod, dosya/klasör adları, kütüphane ve API adları, ekran/bileşen adları İngilizce (örn. `HomeScreen`, `src/features/meals/`).
- **Uydurma yok.** Dış servislerin fiyatı, kotası veya erişim koşulları hakkında emin olmadığın bir bilgiyi kesinmiş gibi yazma; "doğrulanmalı" diye işaretle. Kütüphanelerde kesin sürüm numarası yazma ("güncel kararlı sürüm" de); kesin sürümler iskelet kurulurken belirlenir.
- **Tek kişilik geliştirici için yaz.** Ücretsiz veya ücretsiz katmanı olan servisleri tercih et, gereksiz altyapıdan kaçın.
- **Kısa ve uygulanabilir ol.** Dolgu cümle, pazarlama dili ve tekrar yok. Her belge genelde 80–250 satır arasıdır.

## 3. Platform varsayılanları

Kullanıcının `notes` alanında aksi bir tercih yoksa şu varsayılanları kullan. Gerekçeli bir sebep varsa başka bir kütüphane seçebilirsin; seçimi teknik planda bir cümleyle gerekçelendir.

| Platform | Varsayılanlar |
|---|---|
| `expo` | TypeScript, Expo (managed workflow), Expo Router, ESLint + Prettier. Yerel veri için AsyncStorage veya expo-sqlite. |
| `flutter` | Dart, Flutter stable, go_router, Riverpod, `flutter_lints`. Yerel veri için shared_preferences veya sqflite/drift. |
| `ios_swift` | Swift, SwiftUI, `NavigationStack`, Swift Concurrency. Yerel veri için SwiftData. SwiftLint + swift-format. |
| `android_kotlin` | Kotlin, Jetpack Compose, Navigation Compose, ViewModel + StateFlow. Yerel veri için Room ya da DataStore. ktlint. |

Backend ve auth:

- `backend: none` → Tüm veri cihazda. Auth da `none` değilse bunu "Açık sorular"a yaz (backend olmadan hesap/giriş anlamsızdır).
- `supabase` / `firebase` → İlgili resmi SDK. Proje kurulumu ve anahtarlar ortam değişkeni/yapılandırma dosyasıyla gelir, repoya gerçek anahtar yazılmaz.
- `custom_api` → Mobil uygulama yalnızca bir API istemcisi katmanı içerir (base URL yapılandırılabilir, ilk aşamada mock veriyle çalışır). API'nin kendisinin tasarımı (uç noktalar, veri şekilleri) teknik planda yer alır, ama iskelette API kodu yazılmaz.

## 4. Yazılacak dosyalar

Dört dosyayı da `scripts/output/docs/` altına yaz. Her dosya bir `# ` başlığıyla başlar. Bu dört dosya dışında hiçbir dosya oluşturma veya değiştirme.

### `scripts/output/docs/prd.md` — Ürün belgesi

```
# Ürün belgesi — <name>
```

Bölümler:

- **Özet**: 2–3 cümle. Ne, kimin için, neden.
- **Problem**: Somut, hedef kitlenin dilinden.
- **Hedef kitle**: Birincil kullanıcı ve kullanım anı.
- **MVP kapsamı**: `mvp_features` maddelerinin her biri için alt başlık; kısa açıklama ve 2–4 maddelik kabul kriteri (`- [ ]` biçiminde, test edilebilir).
- **Kapsam dışı (sonraki sürümler)**: MVP'ye alınmayan ama değerli olan maddeler.
- **Kullanıcı hikayeleri**: 4–8 adet, "Bir <kullanıcı> olarak <ihtiyaç>, böylece <fayda>." biçiminde.
- **Gelir modeli**: `monetization`'ın MVP'ye etkisi (MVP'de para kazanma yoksa bunu açıkça yaz).
- **Başarı ölçütleri**: Ölçülebilir 3–5 madde.
- **Açık sorular**: Kullanıcının karar vermesi gereken konular. Yoksa "Yok." yaz.

### `scripts/output/docs/screens.md` — Ekranlar ve akışlar

```
# Ekranlar ve akışlar — <name>
```

Bölümler:

- **Navigasyon yapısı**: Sekme/stack düzeni, kısa bir ağaç olarak (kod bloğu içinde).
- **Ekran listesi**: Tablo — ekran adı (İngilizce bileşen adı), amacı, ilgili MVP özelliği.
- **Ekran detayları**: Her ekran için alt başlık; içerik ve bileşenler, kullanıcı aksiyonları, boş / yükleniyor / hata durumları.
- **Ana akışlar**: 2–4 kritik akış, numaralı adımlarla (örn. ilk açılış/onboarding, ana iş akışı).
- **Tasarım notları**: `design.theme` ve `design.style`'a göre renk, tipografi ve bileşen yaklaşımı. Somut ama kısa (örn. ana renk önerisi, kart mı liste mi).

### `scripts/output/docs/tech-plan.md` — Teknik plan

```
# Teknik plan — <name>
```

Bölümler:

- **Stack**: Platform, dil, ana kütüphaneler (her biri tek satır gerekçeyle).
- **Klasör yapısı**: Kod bloğu içinde ağaç.
- **Veri modeli**: Varlıklar, alanları ve ilişkileri. Verinin nerede tutulduğu (cihaz / backend).
- **Backend ve kimlik doğrulama**: Seçilen `backend` ve `auth`'a göre kurulum. `custom_api` ise uç noktaların taslak listesi.
- **Dış servisler ve API'ler**: Gerekiyorsa; erişim koşulu ve ücretsiz kota (emin değilsen "doğrulanmalı").
- **Yapılandırma ve gizli bilgiler**: Hangi ortam değişkenleri gerekiyor, örnek dosya (örn. `.env.example`), gerçek anahtarların repoya girmeyeceği.
- **Kalite araçları**: Lint/format ve (varsa) tip kontrolü komutları.
- **İskeletin kapsamı**: İskelet kurulurken nelerin **yapılacağı** (proje yapısı, navigasyon, tüm MVP ekranlarının mock veriyle çalışan örnek halleri, tema, README) ve nelerin **yapılmayacağı** (gerçek backend bağlantısı, ödeme, yayın ayarları vb.). Bu bölüm iskeleti kuracak çalışmanın sınırını belirler; açık ve madde madde yaz.

### `scripts/output/docs/roadmap.md` — Yol haritası

```
# Yol haritası — <name>
```

Bölümler:

- **Aşama 0 — İskelet**: Teknik plandaki iskelet kapsamının kısa özeti (bu aşama otomatik yapılacak).
- **Sonraki aşamalar**: Sıralı 3–6 aşama (örn. "Aşama 1 — Yerel veri katmanı", "Aşama 2 — Kimlik doğrulama"). Her aşamada `- [ ]` biçiminde görevler. Her görev tek başına bir GitHub issue'su olabilecek büyüklükte (yarım gün – iki gün arası iş) ve tek cümleyle ne yapılacağını, gerekiyorsa hangi görevden sonra gelmesi gerektiğini söylemeli.
- **Yayın hazırlığı**: Mağaza yayını için gereken işler (ikon, ekran görüntüleri, gizlilik politikası, test dağıtımı vb.).

## 5. Bitirmeden önce kontrol et

- Dört dosya da `scripts/output/docs/` altında ve her biri `# ` ile başlıyor mu?
- Her `mvp_features` maddesi PRD'de, en az bir ekranda ve yol haritasında karşılık buluyor mu?
- Platform, backend, auth ve tasarım seçimleri dört belgede de tutarlı mı?
- MVP'ye `mvp_features` dışında özellik girmedi mi?
