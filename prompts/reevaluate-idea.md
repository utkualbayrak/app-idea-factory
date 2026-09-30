# Fikri kullanıcı notuyla yeniden değerlendir

`scripts/output/idea.json` dosyasındaki fikri oku. Özellikle `user_note` alanındaki kullanıcı notunu dikkate alarak `market`, `feasibility_solo_dev`, `originality`, `overall` puanlarını ve her birinin gerekçesini yeniden değerlendir.

Kurallar:

- Kullanıcının notu güçlü bir sinyal — onu ciddiye al, eski puanlara demir atma. Not, fikrin bir yönünü eleştiriyor, yeni bir açı öneriyor veya bir varsayımı düzeltiyor olabilir; bunu puanlara yansıt.
- Puanlar 0.00-10.00 arası, yalnızca 0.25'in katları (`.00`, `.25`, `.50`, `.75`).
- Gerekçe metinleri Türkçe, kısa (1 cümle), önceki gerekçenin aynısı olmasın — neyin değiştiğini/neden değiştiğini yansıtsın.
- `tags` alanını gerekirse güncelleyebilirsin (İngilizce, 2-4 etiket); değişiklik gerekmiyorsa fikrin mevcut `tags` alanını aynen kopyala.

Puan rehberi (Grup 1'deki ile aynı):

- `market`: Bu problemi yaşayan/bu ürünü isteyecek kişi sayısı büyük mü?
- `feasibility_solo_dev`: Tek geliştiricinin makul sürede MVP çıkarabileceği kadar basit mi? Gerekli API/kaynaklara erişimin kolaylığı da dahil.
- `originality`: Piyasada doğrudan birebir aynısı var mı, yoksa gerçek bir açı/twist mi içeriyor?
- `overall`: Genel değerlendirme (diğer üçünün ortalaması olmak zorunda değil).

Çıktıyı tam olarak aşağıdaki şemaya uyan bir JSON nesnesi olarak **`scripts/output/reevaluation.json`** dosyasına yaz. Dosyada başka hiçbir şey olmasın — açıklama, markdown, yorum yok, sadece geçerli JSON:

```json
{
  "scores": {
    "market": 0.00, "market_reason": "string (Türkçe)",
    "feasibility_solo_dev": 0.00, "feasibility_solo_dev_reason": "string (Türkçe)",
    "originality": 0.00, "originality_reason": "string (Türkçe)",
    "overall": 0.00, "overall_reason": "string (Türkçe)"
  },
  "tags": ["string (İngilizce)"]
}
```
