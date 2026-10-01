# Onaylı planlama belgelerinden uygulama iskeletini kur

`skeleton/` klasöründeki boş repoya, `skeleton/docs/` altındaki onaylı planlama belgelerine göre çalışan bir mobil uygulama iskeleti kur.

Bu belgeleri kullanıcı okuyup gerekirse düzenledi ve onayladı. **Tek doğruluk kaynağı bu belgelerdir.** Belgelerde olmayan bir özelliği ekleme, belgelerdeki bir kararı kendi tercihinle değiştirme.

## 1. Girdiyi oku

- `skeleton/docs/prd.md` — ürün belgesi (MVP kapsamı, kabul kriterleri)
- `skeleton/docs/screens.md` — ekranlar, navigasyon, akışlar, tasarım notları
- `skeleton/docs/tech-plan.md` — stack, klasör yapısı, veri modeli, **"İskeletin kapsamı"** bölümü
- `skeleton/docs/roadmap.md` — iskelet sonrası işler (yalnızca bağlam için; bunları yapma)
- `skeleton/IDEA.md` — fikrin tam hali
- `scripts/output/task-params.json` — `platform`, `backend`, `auth`, `mvp_features`, `design`, `notes`

`skeleton/docs/` altındaki dört belgeden biri yoksa ya da `task-params.json` okunamıyorsa: hiçbir şey kurma; raporu `status: "failed"` ile yaz (bkz. bölüm 6) ve dur.

## 2. Sınırlar

- **Yalnızca `skeleton/` içinde çalış.** İstisnalar: rapor dosyası `scripts/output/skeleton-report.json` ve (yalnızca Expo'da) depo kökündeki geçici `skeleton-work/` klasörü. Bu repodaki başka hiçbir dosyayı değiştirme.
- **`skeleton/docs/` ve `skeleton/IDEA.md` dosyalarına dokunma.**
- **Git komutu çalıştırma** (commit, push, init vb.). Commit ve push'u workflow yapar. Bir araç kendi `.git` klasörünü oluşturursa onu `skeleton/` içine taşıma.
- **Gizli bilgi yok.** Gerçek API anahtarı, token veya parola yazma. Gerekiyorsa `.env.example` gibi bir örnek dosya ve README'de açıklama.
- **Kapsam = tech-plan.md'deki "İskeletin kapsamı".** Orada "yapılmayacak" denen şeyleri (gerçek backend bağlantısı, ödeme, yayın ayarları vb.) yapma.
- Uygulamayı çalıştırma (`expo start`, emülatör vb.), `eas`, `prebuild` veya mağaza/yayın komutları kullanma.

## 3. İskelette olması gerekenler

1. **Çalışan proje yapısı**: tech-plan.md'deki stack ve klasör yapısı.
2. **Navigasyon**: screens.md'deki navigasyon yapısının tamamı.
3. **MVP ekranları**: screens.md'deki her ekran, mock (sahte, kod içinde tanımlı) veriyle çalışan örnek haliyle. Her ekranda belgede tarif edilen ana bileşenler ve aksiyonlar görünür olmalı; aksiyonlar mock veri üzerinde çalışabilir ya da açıkça "yakında" diye işaretlenebilir. Boş/yükleniyor/hata durumlarından en az boş durum olmalı.
4. **Veri modeli**: tech-plan.md'deki varlıklar için tipler/modeller ve mock veri kaynağı. Backend seçildiyse gerçek SDK yerine değiştirilebilir bir veri katmanı arayüzü (örn. repository/service) ve mock uygulaması.
5. **Tema**: `design.theme` ve `design.style`'a ve screens.md'deki tasarım notlarına uygun renk/tipografi tanımları, tek bir yerde.
6. **README.md** (Türkçe): fikrin kısa özeti, kurulum ve çalıştırma adımları, mimari (klasör yapısı + ana kararlar), iskeletin kapsamı ve sınırları, sonraki adımlar için `docs/roadmap.md`'ye yönlendirme. Planlama belgelerine `docs/` altından bağlantı ver.
7. **Lint/format ayarları** ve uygun bir `.gitignore`.

Kod, dosya ve bileşen adları İngilizce; kullanıcıya görünen metinler, belgelerde başka bir dil belirtilmediyse Türkçe.

## 4. Platforma göre kurulum

### `expo` (doğrulama yapılır)

- Projeyi `create-expo-app` ile **`skeleton/` dışında geçici bir klasörde** oluştur (örn. depo kökünde `skeleton-work/`); kurulumu atla (`--no-install`). Şablonu tech-plan.md'ye uygun seç (Expo Router kullanılıyorsa onu içeren TypeScript şablonu). Komutun seçeneklerinden emin değilsen önce `--help` ile bak.
- Oluşan dosyaları `skeleton/` içine kopyala. **`skeleton-work/.git` klasörünü kopyalama, önce sil.** Sonra şablonun örnek ekranlarını belgelerdeki ekranlarla değiştir.
- `skeleton/` içinde sırayla çalıştır ve hataları düzelterek tekrarla:
  1. `npm install`
  2. `npx tsc --noEmit`
  3. Lint (projede tanımlı lint script'i ya da tech-plan.md'deki araç). Lint kurulumu etkileşimli bir soru sorarsa ya da kurulamazsa lint'i atla ve raporda `skipped` yaz.
- Ek paketleri `npx expo install <paket>` ile ekle (Expo SDK'sıyla uyumlu sürüm seçer).
- Tip kontrolü geçmeden işi bitirme. Workflow, raporundan bağımsız olarak `npm install` ve `npx tsc --noEmit` çalıştırır; başarısız olursa görev başarısız sayılır.

### `flutter`, `ios_swift`, `android_kotlin` (doğrulama yapılmaz)

Bu ortamda bu platformların araçları kurulu değil ve komut çalıştırma izni yok; dosyaları doğrudan yaz. Derlenemeyeceği için ekstra dikkatli ol: import'lar, paket adları, dosya yolları ve sözdizimi tutarlı olsun.

- **`flutter`**: `pubspec.yaml`, `analysis_options.yaml`, `lib/` altındaki kod. `android/`, `ios/` gibi platform klasörlerini elle yazma; README'de ilk adım olarak `flutter create .` ile üretileceğini ve ardından `flutter pub get` çalıştırılacağını belirt.
- **`ios_swift`**: Xcode proje dosyasını (`.xcodeproj`) elle yazma. Bunun yerine [XcodeGen](https://github.com/yonaskolb/XcodeGen) için bir `project.yml` ve kaynak dosyaları yaz; README'de `xcodegen generate` adımını anlat. SwiftLint için `.swiftlint.yml`.
- **`android_kotlin`**: Gradle (Kotlin DSL) dosyaları, `app/` modülü ve kaynaklar. İkili dosya olan `gradle-wrapper.jar`'ı yazma; README'de wrapper'ın `gradle wrapper` ile ya da Android Studio'da projeyi açarak üretileceğini anlat.

Bu platformlarda README'ye, iskeletin CI'da derlenmediğini ve ilk açılışta küçük düzeltmeler gerekebileceğini yazan kısa bir not ekle.

## 5. Bitirmeden önce kontrol et

- screens.md'deki her ekran var ve navigasyondan erişilebiliyor mu?
- PRD'deki her MVP özelliği en az bir ekranda görünüyor mu?
- `skeleton/docs/` ve `skeleton/IDEA.md` değişmeden duruyor mu?
- Repoda gizli bilgi, `node_modules` (`.gitignore`'da olmalı) veya geçici klasör kalmadı mı? `skeleton-work/` gibi geçici klasörler `skeleton/` dışında kalmalı.
- (Expo) `npx tsc --noEmit` hatasız geçiyor mu?

## 6. Raporu yaz

En sonda `scripts/output/skeleton-report.json` dosyasını yaz:

```json
{
  "status": "ok",
  "summary": "string (Türkçe, Markdown madde listesi: neler kuruldu — stack, ekranlar, veri katmanı, tema)",
  "checks": {
    "install": "passed",
    "typecheck": "passed",
    "lint": "passed"
  },
  "notes": "string (isteğe bağlı, Türkçe: bilinen eksikler, atlanan adımlar ve nedenleri)"
}
```

- `status`: İskelet bölüm 3'teki gereksinimleri karşılıyorsa (ve Expo'da tip kontrolü geçiyorsa) `"ok"`, aksi halde `"failed"`. `failed` ise `notes` alanında nedenini açıkça yaz.
- `checks` değerleri: `"passed"`, `"failed"` veya `"skipped"`. Doğrulama yapılmayan platformlarda üçü de `"skipped"`.
- `summary` issue'ya yorum olarak eklenir; kısa ve somut tut.
