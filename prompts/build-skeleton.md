# Onaylı planlama belgelerinden uygulama iskeletini kur

`skeleton/` klasöründeki repoya, `skeleton/docs/` altındaki onaylı planlama belgelerine göre çalışan bir mobil uygulama iskeleti kur.

Bu belgeleri kullanıcı okuyup gerekirse düzenledi ve onayladı. **Tek doğruluk kaynağı bu belgelerdir.** Belgelerde olmayan bir özelliği ekleme, belgelerdeki bir kararı kendi tercihinle değiştirme.

## 1. Girdiyi oku

Önce dört belgeyi baştan sona oku; kod yazmaya ancak ondan sonra başla.

- `skeleton/docs/prd.md` — ürün belgesi: özellik kimlikleri (`F1`, `F2`, …), MVP kapsamı, kabul kriterleri, **"Açık sorular"** ve varsayımları
- `skeleton/docs/screens.md` — ekranlar, navigasyon, akışlar, tasarım notları (renk paleti, tipografi)
- `skeleton/docs/tech-plan.md` — stack, uygulama kimliği, klasör yapısı, veri modeli, test kurulumu ve **"İskeletin kapsamı"** bölümü
- `skeleton/docs/roadmap.md` — iskelet sonrası işler (yalnızca bağlam için; bunları yapma)
- `skeleton/IDEA.md` — fikrin tam hali (yalnızca arka plan bilgisi)
- `scripts/output/task-params.json` — yalnızca `platform` alanını kullan

### Hangi kaynak geçerli?

- Kullanıcı belgeleri onaydan önce düzenlemiş olabilir; bu yüzden `task-params.json` ve `IDEA.md` eski kalmış olabilir.
- **Kapsam, ekranlar, veri modeli, auth, backend ve tasarım** için yalnızca belgelere bak. `task-params.json`'daki `mvp_features`, `backend`, `auth`, `design` alanlarını kullanma; MVP özellikleri PRD'deki `F` kimlikli maddelerdir.
- **Platform**: `task-params.json`'daki `platform` alanı hangi kurulum yolunun (bölüm 4) izleneceğini belirler. tech-plan.md'deki stack bununla çelişiyorsa (örn. parametre `expo` ama belge Flutter anlatıyor) hiçbir şey kurma; raporu `status: "failed"` ile yaz ve çelişkiyi `notes`'ta açıkla.
- **Açık sorular**: PRD'deki her açık sorunun yanındaki "Varsayım" bağlayıcıdır. Kullanıcı bir varsayımı belge içinde değiştirdiyse güncel hali geçerlidir.
- Belgeler bir konuda belirsiz veya kendi içinde çelişkiliyse, en basit ve en geri alınabilir seçeneği uygula ve bu kararı raporun `notes` alanına yaz.

### Hata durumları

`skeleton/docs/` altındaki dört belgeden biri yoksa ya da `task-params.json` okunamıyorsa veya `platform` alanı geçersizse: hiçbir şey kurma; raporu `status: "failed"` ile yaz (bkz. bölüm 7) ve dur.

## 2. Sınırlar

- **Yalnızca `skeleton/` içinde çalış.** İstisnalar: rapor dosyası `scripts/output/skeleton-report.json` ve (yalnızca Expo'da) depo kökündeki geçici `skeleton-work/` klasörü. Bu repodaki başka hiçbir dosyayı değiştirme.
- **Şunlara dokunma:** `skeleton/docs/`, `skeleton/IDEA.md` ve `skeleton/.git/` (varsa). Planlama belgeleri zaten `skeleton/docs/` altında; tech-plan.md'de "belgelerin `docs/` klasörüne kopyalanması" yazıyorsa bu adım yapılmış sayılır.
- `skeleton/` içinde bunların dışında önceki bir denemeden kalmış dosyalar varsa, bunları silip baştan başlayabilirsin.
- **Git komutu çalıştırma** (commit, push, init vb.). Commit ve push'u workflow yapar. Bir araç kendi `.git` klasörünü oluşturursa onu `skeleton/` içine taşıma veya kopyalama.
- **Gizli bilgi yok.** Gerçek API anahtarı, token veya parola yazma. Gerekiyorsa `.env.example` gibi bir örnek dosya ve README'de açıklama.
- **Kapsam = tech-plan.md'deki "İskeletin kapsamı".** Orada "yapılmayacak" denen şeyleri (gerçek backend bağlantısı, gerçek kimlik doğrulama, ödeme, analitik, bildirimler, yayın ayarları vb.) yapma. Bu servislerin SDK'larını da kurma; yalnızca bölüm 3'teki veri katmanı arayüzünü yaz.
- Uygulamayı çalıştırma (`expo start`, emülatör vb.), `eas`, `prebuild` veya mağaza/yayın komutları kullanma.

## 3. İskelette olması gerekenler

1. **Çalışan proje yapısı**: tech-plan.md'deki stack ve klasör yapısı. Uygulama adı ve uygulama kimliği (bundle identifier / application ID) tech-plan.md'deki değerlerle ayarlanmış olmalı.
2. **Navigasyon**: screens.md'deki navigasyon yapısının tamamı.
3. **MVP ekranları**: screens.md'deki her ekran, **belgedeki adıyla birebir aynı adla**, mock (sahte, kod içinde tanımlı) veriyle çalışan örnek haliyle.
   - Her ekranda belgede tarif edilen ana bileşenler ve aksiyonlar görünür olmalı.
   - Aksiyonlar mock veri üzerinde çalışabilir ya da açıkça "yakında" diye işaretlenebilir.
   - Boş/yükleniyor/hata durumlarından en az boş durum olmalı.
   - Her ekran dosyasının başında, hangi özellik kimliğine (`F1`, …) ait olduğunu belirten kısa bir yorum olsun.
4. **Veri katmanı**: tech-plan.md'deki varlıklar için, belgedeki adlarla birebir aynı adlı tipler/modeller.
   - Ekranlar veriye doğrudan değil, her zaman bir veri katmanı arayüzü (örn. repository/service) üzerinden erişir.
   - Bu arayüzün iskeletteki tek uygulaması mock veriyle çalışan, bellekte tutulan bir uygulamadır. Backend `none` olsa bile böyle yap; kalıcı yerel veri sonraki aşamaların işidir.
   - Mock veri ayrı bir yerde dursun (örn. `src/data/mock/`), böylece sonradan kolayca kaldırılabilsin.
5. **Tema**: screens.md'deki tasarım notlarındaki renk paleti (hex değerleriyle), tipografi ölçeği ve bileşen yaklaşımı, tek bir yerde tanımlı. Tema açık+koyu ise sistem ayarına uymalı. Ekranlar renkleri doğrudan yazmaz, temadan alır.
6. **Testler**: tech-plan.md'deki test aracının kurulumu ve en az bir anlamlı örnek test (örn. mock repository'nin veri döndürdüğünü ya da bir ekranın boş durumunu doğrulayan bir test).
7. **README.md** (Türkçe):
   - Fikrin kısa özeti.
   - Kurulum, çalıştırma, lint ve test komutları.
   - Mimari: klasör yapısı ve ana kararlar.
   - İskeletin kapsamı ve sınırları (mock veri, yapılmayanlar).
   - Planlama belgelerine `docs/` altından bağlantılar; sonraki adımlar için `docs/roadmap.md`'ye yönlendirme.
8. **CLAUDE.md**: Bu repoda sonradan çalışacak Claude Code oturumları için kısa (30–60 satır) bir rehber:
   - Planlama belgelerinin `docs/` altında olduğu ve tek doğruluk kaynağı olduğu; işe `docs/roadmap.md`'deki sıradaki görevden başlanacağı.
   - Kurulum, tip kontrolü, lint ve test komutları.
   - Klasör yapısı ve kurallar: ekranların veriye yalnızca veri katmanı üzerinden erişmesi, renklerin temadan alınması, adlandırma kuralları.
   - Gizli bilgilerin repoya yazılmayacağı.
9. **Lint/format ayarları** ve uygun bir `.gitignore` (bağımlılık klasörleri, derleme çıktıları, `.env` dosyaları). Kilit dosyaları (örn. `package-lock.json`) `.gitignore`'a eklenmez.

Kod, dosya ve bileşen adları İngilizce; kullanıcıya görünen metinler, belgelerde başka bir dil belirtilmediyse Türkçe.

## 4. Platforma göre kurulum

### `expo` (doğrulama yapılır)

- Projeyi `create-expo-app` ile **`skeleton/` dışında geçici bir klasörde** oluştur (depo kökünde `skeleton-work/`); kurulumu atla (`--no-install`). Şablonu tech-plan.md'ye uygun seç (Expo Router kullanılıyorsa onu içeren TypeScript şablonu). Komutun seçeneklerinden emin değilsen önce `--help` ile bak. Komut etkileşimli soru sormasın diye gerekli tüm seçenekleri komut satırında ver.
- `skeleton-work/.git` klasörü oluştuysa önce onu sil. Sonra oluşan dosyaları `skeleton/` içine kopyala (`skeleton/docs/`, `skeleton/IDEA.md` ve `skeleton/.git/`'in üzerine yazmadan).
- Şablonun örnek ekranlarını, örnek bileşenlerini, örnek varlıklarını (asset) ve şablona özgü yardımcı script'leri (örn. projeyi sıfırlama script'i) kaldır; yerlerine belgelerdeki ekranları koy.
- `app.json`/`app.config` içinde `name`, `slug`, `ios.bundleIdentifier` ve `android.package` değerlerini tech-plan.md'ye göre ayarla.
- Ek paketleri `npx expo install <paket>` ile ekle (Expo SDK'sıyla uyumlu sürüm seçer).
- `skeleton/` içinde sırayla çalıştır ve hataları düzelterek tekrarla:
  1. `npm install`
  2. `npx tsc --noEmit`
  3. Lint (projede tanımlı lint script'i ya da tech-plan.md'deki araç). Lint kurulumu etkileşimli bir soru sorarsa ya da kurulamazsa lint'i atla ve raporda `skipped` yaz.
  4. Testler (projede tanımlı test script'i). Test aracı kurulamazsa testi atla ve raporda `skipped` yaz.
- Tip kontrolü geçmeden işi bitirme. Workflow, raporundan bağımsız olarak `npm install` ve `npx tsc --noEmit` çalıştırır; başarısız olursa görev başarısız sayılır.
- İş bitince depo kökündeki `skeleton-work/` klasörünü sil.

### `flutter`, `ios_swift`, `android_kotlin` (doğrulama yapılmaz)

Bu ortamda bu platformların araçları kurulu değil ve bu platformlar için komut çalıştırma izni yok; dosyaları doğrudan yaz. Derlenemeyeceği için ekstra dikkatli ol: import'lar, paket adları, dosya yolları ve sözdizimi tutarlı olsun. Bilmediğin veya emin olmadığın bir API'yi kullanma; platformun yaygın, uzun süredir kararlı API'lerini tercih et.

- **`flutter`**: `pubspec.yaml` (uygulama adı tech-plan.md'ye uygun), `analysis_options.yaml`, `lib/` altındaki kod ve `test/` altındaki örnek test. `android/`, `ios/` gibi platform klasörlerini elle yazma; README'de ilk adım olarak `flutter create --org <uygulama kimliğinin son parça hariç hali> .` ile üretileceğini ve ardından `flutter pub get` çalıştırılacağını belirt.
- **`ios_swift`**: Xcode proje dosyasını (`.xcodeproj`) elle yazma. Bunun yerine [XcodeGen](https://github.com/yonaskolb/XcodeGen) için bir `project.yml` (bundle identifier ve minimum iOS sürümü tech-plan.md'ye göre; uygulama ve test hedefleriyle) ve kaynak dosyaları yaz; README'de `xcodegen generate` adımını anlat. SwiftLint için `.swiftlint.yml`.
- **`android_kotlin`**: Gradle (Kotlin DSL) dosyaları (`applicationId` ve `minSdk` tech-plan.md'ye göre), `app/` modülü, kaynaklar ve örnek bir birim testi. İkili dosya olan `gradle-wrapper.jar`'ı yazma; README'de wrapper'ın `gradle wrapper` ile ya da Android Studio'da projeyi açarak üretileceğini anlat.

Bu platformlarda README'ye, iskeletin CI'da derlenmediğini ve ilk açılışta küçük düzeltmeler gerekebileceğini yazan kısa bir not ekle.

## 5. Hataları düzeltme kuralları

Tip kontrolü, lint veya test hatalarını **gerçekten düzelt**; görmezden gelinmesini sağlama:

- `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `any` ile tip kaçırma, `eslint-disable` yorumları kullanma.
- `tsconfig`'de `strict`'i kapatma veya kontrolleri gevşetme; lint kurallarını toplu olarak kapatma.
- Başarısız bir testi silme, atlama (`skip`) veya anlamsız hale getirme.

Bir hata makul sayıda denemeden sonra düzelmiyorsa, düzeltmeyi zorlamak yerine durumu raporun `notes` alanına yaz ve ilgili kontrolü `failed` olarak işaretle.

## 6. Bitirmeden önce kontrol et

- screens.md'deki her ekran, belgedeki adıyla var ve navigasyondan erişilebiliyor mu?
- PRD'deki her özellik kimliği (`F1`, `F2`, …) en az bir ekranda karşılık buluyor mu?
- Veri modelindeki her varlık, belgedeki adıyla tanımlı mı ve ekranlar veriye yalnızca veri katmanı üzerinden mi erişiyor?
- PRD'deki açık soruların varsayımlarına uyuldu mu?
- Uygulama adı ve uygulama kimliği tech-plan.md'deki değerlerle ayarlı mı?
- Şablondan kalan örnek ekran, bileşen veya script kalmadı mı?
- README.md ve CLAUDE.md var mı?
- `skeleton/docs/`, `skeleton/IDEA.md` ve `skeleton/.git/` değişmeden duruyor mu?
- Repoda gizli bilgi yok mu ve `node_modules` `.gitignore`'da mı? `skeleton-work/` silindi mi?
- (Expo) `npx tsc --noEmit` hatasız geçiyor mu?
- Bölüm 5'teki yasaklı yöntemlerin hiçbiri kullanılmadı mı?

## 7. Raporu yaz

En sonda `scripts/output/skeleton-report.json` dosyasını yaz:

```json
{
  "status": "ok",
  "summary": "string (Türkçe, Markdown madde listesi)",
  "checks": {
    "install": "passed",
    "typecheck": "passed",
    "lint": "passed",
    "test": "passed"
  },
  "notes": "string (Türkçe, Markdown madde listesi; boş olabilir)"
}
```

- `status`: İskelet bölüm 3'teki gereksinimleri karşılıyorsa (ve Expo'da tip kontrolü geçiyorsa) `"ok"`, aksi halde `"failed"`. `failed` ise `notes` alanında nedenini açıkça yaz.
- `checks` değerleri: `"passed"`, `"failed"` veya `"skipped"`. Doğrulama yapılmayan platformlarda dördü de `"skipped"`. Hiçbir şey kurulmadıysa (bölüm 1'deki hata durumları) dördü de `"skipped"`.
- `summary`: Issue'ya yorum olarak eklenir; kısa ve somut tut. Neler kuruldu: stack, ekranlar (adlarıyla), veri katmanı, tema, testler.
- `notes`: Şunları içersin (yoksa boş string):
  - Belgelerin belirsiz veya çelişkili olduğu ve senin karar verdiğin noktalar, verdiğin kararla birlikte.
  - Atlanan adımlar ve nedenleri.
  - Bilinen eksikler veya başarısız kontroller.
- Rapor geçerli JSON olmalı; dosyada başka hiçbir şey olmasın.