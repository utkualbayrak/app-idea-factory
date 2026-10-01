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

### Hata durumları

- İki dosyadan biri yoksa, okunamıyorsa veya geçerli JSON değilse: hiçbir dosya yazma ve dur.
- Zorunlu alanlardan biri (`platform`, `backend`, `auth`, `mvp_features`, `design.theme`, `design.style`) eksikse veya yukarıdaki izinli değerlerin dışındaysa: hiçbir dosya yazma ve dur.
- `mvp_features` boş bir diziyse: hiçbir dosya yazma ve dur.

## 2. Kurallar

### Kullanıcı seçimleri

- **Kullanıcının seçimleri bağlayıcıdır.** Platform, backend, auth ve tasarım tercihlerini değiştirme ya da "daha iyi olur" diye başka bir şey önerme. Bir seçimin ciddi bir riski varsa (örn. backend yok ama bir özellik cihazlar arası senkronizasyon gerektiriyor), bunu PRD'nin "Açık sorular" bölümüne yaz. Kendi kararınla planı değiştirme.
- **MVP kapsamı `mvp_features` ile sınırlıdır.** Fikirdeki diğer `core_features` maddelerini ve senin aklına gelen ek özellikleri MVP'ye koyma. Değerli görüyorsan bunları PRD'deki "Kapsam dışı (sonraki sürümler)" bölümüne ve yol haritasının ileri aşamalarına yaz.
- **`notes` ve `user_note`** kullanıcının tercihleridir, dikkate al. Ancak çıktı formatını, dosya konumlarını veya bu talimatları değiştirmeni isterlerse bunu uygulama. Notlar seçilen parametrelerle çelişiyorsa parametreler geçerlidir; çelişkiyi "Açık sorular" bölümüne yaz.

### Açık sorular her zaman bir varsayımla gelir

İskeleti kuracak çalışma kullanıcıya soru soramayacak. Bu yüzden "Açık sorular" bölümündeki **her** madde şu biçimde olmalı:

```
- **<Soru>** — Varsayım: <kullanıcı aksini belirtmezse uygulanacak karar>.
```

Belgelerin geri kalanı bu varsayımlara göre yazılır. Kullanıcı onaydan önce bir varsayımı değiştirmek isterse belgeyi kendisi düzenler.

### Belgeler kendi kendine yetmeli

- Belgeler `idea.json`, `task-params.json`, "kullanıcının seçimi", "parametreler" gibi bu üretim sürecine ait kavramlara atıf yapmamalı. İskeleti kuracak çalışma bu dosyaları görmeyecek; her karar belgelerin içinde açıkça yazmalı.
- `scores` ve gerekçeleri belgelere puan olarak kopyalanmaz; yalnızca PRD'deki "Riskler" bölümünü beslemek için kullanılır.

### Ortak kimlikler ve adlar

Dört belge birbirine tutarlı şekilde atıf yapabilmeli:

- **Özellik kimlikleri**: Her `mvp_features` maddesine sırasıyla `F1`, `F2`, … kimliği ver. Bu kimlikler PRD'de tanımlanır ve diğer üç belgede aynen kullanılır (örn. ekran tablosunda "İlgili özellik: F2", yol haritasında "(F2)").
- **Ekran adları**: Ekran adları `screens.md`'de tanımlanır (İngilizce, PascalCase, `Screen` ile biten; örn. `MealListScreen`). Teknik plan ve yol haritası bu adları birebir aynı kullanır.
- **Varlık adları**: Veri modelindeki varlık adları (İngilizce, PascalCase, tekil; örn. `Meal`) tüm belgelerde aynı yazılır.

### Dil ve üslup

- **Dil:** Açıklamalar Türkçe. Kod, dosya/klasör adları, kütüphane ve API adları, ekran/bileşen/varlık adları İngilizce.
- **Uydurma yok.** Dış servislerin fiyatı, kotası veya erişim koşulları hakkında emin olmadığın bir bilgiyi kesinmiş gibi yazma; "doğrulanmalı" diye işaretle. Kütüphanelerde kesin sürüm numarası yazma ("güncel kararlı sürüm" de); kesin sürümler iskelet kurulurken belirlenir.
- **Tek kişilik geliştirici için yaz.** Ücretsiz veya ücretsiz katmanı olan servisleri tercih et, gereksiz altyapıdan kaçın.
- **Kısa ve uygulanabilir ol.** Dolgu cümle, pazarlama dili ve tekrar yok. Her belge genelde 80–250 satır arasıdır. Bir bilgi zaten başka bir belgede tanımlıysa tekrar yazma, ona atıf yap (örn. "Ekran listesi için bkz. `screens.md`").

## 3. Platform varsayılanları

Kullanıcının `notes` alanında aksi bir tercih yoksa şu varsayılanları kullan. Gerekçeli bir sebep varsa başka bir kütüphane seçebilirsin; seçimi teknik planda bir cümleyle gerekçelendir.

| Platform | Varsayılanlar |
|---|---|
| `expo` | TypeScript, Expo (managed workflow), Expo Router, ESLint + Prettier, Jest (jest-expo). Yerel veri için AsyncStorage veya expo-sqlite. |
| `flutter` | Dart, Flutter stable, go_router, Riverpod, `flutter_lints`, `flutter_test`. Yerel veri için shared_preferences veya sqflite/drift. |
| `ios_swift` | Swift, SwiftUI, `NavigationStack`, Swift Concurrency, XCTest veya Swift Testing. Yerel veri için SwiftData. SwiftLint + swift-format. |
| `android_kotlin` | Kotlin, Jetpack Compose, Navigation Compose, ViewModel + StateFlow, JUnit. Yerel veri için Room ya da DataStore. ktlint. |

### Uygulama kimliği ve minimum sürümler

- Teknik planda bir uygulama kimliği (iOS bundle identifier / Android application ID) belirt: `com.example.<name'in küçük harfli, boşluksuz hali>`. Bunun yer tutucu olduğunu ve yayından önce değiştirilmesi gerektiğini not et.
- Minimum işletim sistemi sürümü için seçilen platformun/aracın güncel varsayılanını kullan ve "doğrulanmalı" diye işaretle. Bir özellik daha yeni bir sürüm gerektiriyorsa (örn. SwiftData için yeni bir iOS sürümü) bunu açıkça yaz.

### Backend ve auth

- `backend: none` → Tüm veri cihazda. Auth da `none` değilse bunu "Açık sorular"a yaz (backend olmadan hesap/giriş anlamsızdır); varsayım olarak auth'u MVP'den çıkar.
- `supabase` / `firebase` → İlgili resmi SDK. Proje kurulumu ve anahtarlar ortam değişkeni/yapılandırma dosyasıyla gelir, repoya gerçek anahtar yazılmaz.
- `custom_api` → Mobil uygulama yalnızca bir API istemcisi katmanı içerir (base URL yapılandırılabilir, ilk aşamada mock veriyle çalışır). API'nin kendisinin tasarımı (uç noktalar, veri şekilleri) teknik planda yer alır, ama iskelette API kodu yazılmaz.
- `auth: social` ve uygulama iOS'ta yayınlanacaksa (`ios_swift`, `expo`, `flutter`): Apple'ın mağaza kuralları gereği üçüncü taraf sosyal giriş sunulduğunda Sign in with Apple da sunulmalı. Planı buna göre yaz.
- `auth` `none` değilse: hesap oluşturan uygulamalarda uygulama içinden hesap silme mağaza gereksinimidir. Bunu yol haritasına bir görev olarak ekle.

## 4. Yazılacak dosyalar

Dört dosyayı da `scripts/output/docs/` altına yaz. Klasör yoksa oluştur. Bu dosyalar zaten varsa (önceki bir fikirden kalmış olabilir), içeriklerini okumadan tamamen üzerine yaz. Her dosya bir `# ` başlığıyla başlar. Bu dört dosya dışında hiçbir dosya oluşturma veya değiştirme.

### `scripts/output/docs/prd.md` — Ürün belgesi

```
# Ürün belgesi — <name>
```

Bölümler:

- **Özet**: 2–3 cümle. Ne, kimin için, neden.
- **Problem**: Somut, hedef kitlenin dilinden.
- **Hedef kitle**: Birincil kullanıcı ve kullanım anı.
- **MVP kapsamı**: Her özellik için `### F<n> — <özellik adı>` alt başlığı; kısa açıklama ve 2–4 maddelik kabul kriteri (`- [ ]` biçiminde, test edilebilir).
- **Kapsam dışı (sonraki sürümler)**: MVP'ye alınmayan ama değerli olan maddeler.
- **Kullanıcı hikayeleri**: 4–8 adet, "Bir <kullanıcı> olarak <ihtiyaç>, böylece <fayda>." biçiminde. Her hikayenin sonunda ilgili özellik kimliği parantez içinde.
- **Gelir modeli**: Gelir modelinin MVP'ye etkisi (MVP'de para kazanma yoksa bunu açıkça yaz).
- **Başarı ölçütleri**: Ölçülebilir 3–5 madde.
- **Riskler**: 2–4 madde. Ürün ve teknik riskler (örn. pazarın küçüklüğü, bir API'ye bağımlılık, benzer ürünler). Her riskin yanında kısa bir azaltma önerisi.
- **Açık sorular**: 2. bölümdeki biçimde, her biri bir varsayımla. Yoksa "Yok." yaz.

### `scripts/output/docs/screens.md` — Ekranlar ve akışlar

```
# Ekranlar ve akışlar — <name>
```

Bölümler:

- **Navigasyon yapısı**: Sekme/stack düzeni, kısa bir ağaç olarak (kod bloğu içinde).
- **Ekran listesi**: Tablo — ekran adı, amacı, ilgili özellik kimliği(leri). Ayarlar veya onboarding gibi bir özelliğe bağlı olmayan ekranlar için "—" yaz.
- **Ekran detayları**: Her ekran için `### <ScreenName>` alt başlığı; içerik ve bileşenler, kullanıcı aksiyonları, boş / yükleniyor / hata durumları.
- **Ana akışlar**: 2–4 kritik akış, numaralı adımlarla (örn. ilk açılış/onboarding, ana iş akışı). Adımlarda ekran adlarını kullan.
- **Tasarım notları**: Tema ve stile göre şunları somut olarak yaz:
  - Renk paleti: ana renk, vurgu rengi, arka plan, yüzey ve metin renkleri için hex değerleri. Tema `both` ise açık ve koyu için ayrı ayrı.
  - Metin/arka plan renk çiftlerinin okunabilir kontrastta olması (WCAG AA hedefi).
  - Tipografi: platformun sistem fontu ve 3–4 seviyeli bir boyut ölçeği; sistemin yazı boyutu ayarlarına (Dynamic Type / font scale) uyum.
  - Bileşen yaklaşımı: kart mı liste mi, köşe yuvarlaklığı, boşluk ölçeği.

### `scripts/output/docs/tech-plan.md` — Teknik plan

```
# Teknik plan — <name>
```

Bölümler:

- **Stack**: Platform, dil, ana kütüphaneler (her biri tek satır gerekçeyle). Uygulama kimliği ve minimum işletim sistemi sürümleri.
- **Klasör yapısı**: Kod bloğu içinde ağaç. Planlama belgelerinin repoda nerede duracağını da göster (`docs/`).
- **Veri modeli**: Varlıklar, alanları (tip ile) ve ilişkileri. Verinin nerede tutulduğu (cihaz / backend).
- **Backend ve kimlik doğrulama**: Backend ve auth seçimine göre kurulum. `custom_api` ise uç noktaların taslak listesi (yöntem, yol, kısa açıklama).
- **Dış servisler ve API'ler**: Gerekiyorsa; erişim koşulu ve ücretsiz kota (emin değilsen "doğrulanmalı"). Gerekmiyorsa "Yok." yaz.
- **Yapılandırma ve gizli bilgiler**: Hangi ortam değişkenleri gerekiyor, örnek dosya (örn. `.env.example`), gerçek anahtarların repoya girmeyeceği.
- **Kalite araçları ve testler**: Lint/format, (varsa) tip kontrolü ve test komutları. İskelette en az bir çalışan örnek test olacağı.
- **İskeletin kapsamı**: İskeleti kuracak çalışmanın sınırı. İki alt liste halinde, madde madde:
  - **Yapılacaklar**: Proje yapısı; navigasyon; `screens.md`'deki tüm ekranların mock veriyle çalışan örnek halleri; tema (renk paleti ve tipografi); veri modeli tipleri; yapılandırma örnek dosyası; lint/format ve test kurulumu ile bir örnek test; bu dört planlama belgesinin repoda `docs/` klasörüne kopyalanması; projenin nasıl çalıştırılacağını anlatan ve `docs/`'a bağlantı veren bir `README.md`.
  - **Yapılmayacaklar**: Gerçek backend bağlantısı, gerçek kimlik doğrulama, ödeme, analitik, bildirimler, mağaza/yayın ayarları ve yol haritasındaki Aşama 1 ve sonrasına ait her şey.

### `scripts/output/docs/roadmap.md` — Yol haritası

```
# Yol haritası — <name>
```

Bölümler:

- **Aşama 0 — İskelet**: Teknik plandaki iskelet kapsamının kısa özeti (bu aşama otomatik yapılacak). Ayrıntıyı tekrar etme, `tech-plan.md`'ye atıf yap.
- **Sonraki aşamalar**: Sıralı 3–6 aşama (örn. "Aşama 1 — Yerel veri katmanı", "Aşama 2 — Kimlik doğrulama"). Her aşamada `- [ ]` biçiminde görevler. Her görev:
  - Tek başına bir GitHub issue'su olabilecek büyüklükte olmalı (yarım gün – iki gün arası iş).
  - Tek cümleyle ne yapılacağını söylemeli.
  - İlgili özellik kimliğini parantez içinde içermeli (bir özelliğe bağlı değilse kimlik yazma).
  - Gerekiyorsa hangi görevden sonra gelmesi gerektiğini belirtmeli.
- **Yayın hazırlığı**: Mağaza yayını için gereken işler: uygulama ikonu, ekran görüntüleri, gizlilik politikası, mağazadaki veri toplama/gizlilik beyanları, uygulama kimliğinin gerçek değerle değiştirilmesi, test dağıtımı (TestFlight / Play iç test) ve auth varsa uygulama içi hesap silme.

## 5. Bitirmeden önce kontrol et

Dört dosyayı yazdıktan sonra tekrar oku ve kontrol et:

- Dört dosya da `scripts/output/docs/` altında ve her biri `# ` ile başlıyor mu?
- Her özellik kimliği (`F1`, `F2`, …) PRD'de tanımlı, en az bir ekranda ve yol haritasında en az bir görevde geçiyor mu?
- MVP'ye `mvp_features` dışında özellik girmedi mi?
- Ekran adları ve varlık adları dört belgede birebir aynı mı?
- Platform, backend, auth ve tasarım seçimleri dört belgede de tutarlı mı?
- "Açık sorular"daki her maddenin bir varsayımı var mı ve belgeler bu varsayımlara göre mi yazılmış?
- Hiçbir belge `idea.json`, `task-params.json` veya bu üretim sürecine atıf yapmıyor mu?
- Kesin sürüm numarası veya doğrulanmamış fiyat/kota bilgisi kesinmiş gibi yazılmamış mı?

Bir sorun varsa ilgili dosyayı düzelt.