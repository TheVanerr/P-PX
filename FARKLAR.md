# İki programın farkları

P&ID ve pnömatik aynı çizim motorundan türemiştir. P&ID'nin motoru daha ileridedir. Sembol, kural ve kod bağlantısı (`logic`, `symbols`, `presets`, `machines`, `xlsx`, `wizard`, `generator`, `pidlink`, `pidx`, `place`) programa özgüdür, ayrı kalmalıdır.

## Kaydetme

Pnömatik'te ayrı bir kaydetme yapısı yok. `scheduleSave`, `saveNow`, `runSave`, `flushSave` ve `saveProject` iki programda satır satır aynıydı. Tek fark, P&ID'nin eski sembolleri açılışta yükseltip kaydetmesidir. Pnömatik daha iyi kaydediyor gibi görünüyorsa belirli bir belirti aranmalıdır.

Ortak zayıflıklar: otomatik yeniden deneme yoktu, çakışma algılanmıyordu, iki cihaz arasında eşitleme yoktu. Üçü de giderildi.

## Birleştirmede eşitlenenler

| Konu | Önce | Şimdi |
|---|---|---|
| Veri | İki klasör, iki izin, eski kod listesi kopyası | Tek GitHub deposu, tek kod listesi, izin yok |
| Pnömatik PDF | Yazdırma penceresi | P&ID gibi doğrudan vektörel PDF, gömülü yazı tipi |
| Pnömatik Geri Al | Sayfa sırasına göre; başka sayfadaki değişiklik görünmezdi | Sayfa kimliğine göre, değişen sayfaya geçer |
| Pnömatik yarım hat | Sayfa değişince başka sayfaya taşınırdı | Temizlenir |
| Esc ile pencere kapatma | P&ID: çalışmazdı. Pnömatik: onay penceresinde sayfa silme yarım kalırdı | İkisinde de çalışır, onay "Vazgeç" sayılır |
| Başarısız kayıt | Sonraki düzenlemeyi beklerdi | İkisinde de 15 saniyede bir yeniden dener |
| Pnömatik sayfa ekleme | Etiketsiz `+`; sağ panelde düğme yoktu | Alt çubukta `+ Sayfa`, sağ panelde `+ Yeni sayfa` |
| Sayfa ekleme düğmesi | İkisinde de: ad alanından çıkarken tıklama kaybolurdu, çok sayfada düğme ve açık sekme görünmezdi | İkisinde de tıklama kaybolmaz, düğme ve açık sekme görünür kalır |
| Pnömatik sayfa işlemleri | Yalnız ekleme ve silme; önceki sayfa silinince açık sayfa kayardı | Çoğaltma, sıralama, seçimi taşıma, PageUp/Down; silmede açık sayfa korunur |

Pnömatiğe özgü fark: sayfa bağlantıları (`ŞEMA 2`) hava hattını sayfa numarasıyla sürdürür, bu yüzden sıralama, çoğaltma ve silme bu numaraları da günceller. P&ID'de bağlantı yalnız yazıdır, güncelleme gerekmez.

## Kalan işler (P&ID'den pnömatiğe)

Bunlar `model.js` ve çizim verisine dokunur, her biri kendi testiyle ayrı yapılmalıdır. Süre tahminidir.

| Özellik | Bugün pnömatikte | Büyüklük | Not |
|---|---|---|---|
| Panel hızlandırma | Her çizimde yeniden kurulur | Küçük | |
| Gruplama | Yok | Orta | Sürükleme kodu değişir |
| Revizyon bulutları | Yalnız revizyon tablosu | Orta | Karşılaştırmaya bobin, sensör ve P&ID kodu eklenmeli |
| Çok dilli PDF ve eksik çeviri kontrolü | Tek dil, kapakta seçilir | Orta | Çeviri alanları gerekir |
| Boyut ölçekleme | Yok | Orta-büyük | Bobin ve sensör yazı konumları etkilenir |

## Kalan iş (pnömatikten P&ID'ye)

| Özellik | Bugün P&ID'de | Büyüklük |
|---|---|---|
| Sağ tuşla kaydırırken yerleştirilen sembol ve yarım hat imleci izler | Bazı durumlarda izlemez | Küçük |
