# PNOMATIKX

P&ID kodlarıyla bağlantılı pnömatik devre şeması programı. P&IDX çizim motorunun arayüzünü kullanır; semboller ISO 1219-1, şema düzeni ve bileşen kodları ISO 1219-2'ye göredir. Kurulum gerektirmez, tarayıcıda çalışır.

## Başlatma

1. `index.html` dosyasını **Chrome veya Edge** ile açın.
2. İlk açılışta `index.html`'in bulunduğu ana klasörü (`PNOMATIKX`) seçip düzenleme izni verin.
3. Ana ekrandaki **P&IDX klasörünü bağla** düğmesiyle P&IDX ana klasörünü seçin (içinde `P&ID/data` olan klasör). Bu bağlantı isteğe bağlıdır ve **yalnız okunur**: P&ID projeleri, çizimdeki kodlar, P&ID kod listesi ve makine kayıtları buradan okunur, P&IDX'e hiçbir şey yazılmaz.

Klasörler hatırlanır, ancak tarayıcı her yeniden açıldığında izin yeniden istenir. P&IDX bağlı değilken program yine çalışır; P&ID kod listesi `PNOMATIK/data/pid-kod*.csv` kopyasından okunur.

## Bölümler

| Bölüm | Nerede | Ne yapar |
|---|---|---|
| Projeler | Ana ekran | Pnömatik proje açar, çizim motorunda şema çizer |
| P&ID Projeleri | Ana ekran, sekme | P&IDX'teki P&ID projeleri ve makine kayıtları; pnömatik kod sayıları, tek tıkla pnömatik proje |
| Kod Eşleştirme | Ana ekran, sekme | Her P&ID kodunun pnömatik rolü (bobin, sensör, ana valf…); düzenleme, CSV alma ve verme |

## P&ID ↔ Pnömatik kod bağlantısı

P&ID'de valfler `V31` gibi **V + numara** ile kodlanır. Pnömatik şemada ise ISO 1219-2 kodları kullanılır:

| Pnömatik kod | Anlamı | P&ID karşılığı (örnek) |
|---|---|---|
| `0V1` | Manuel kesme vanası (besleme) | — |
| `0Z1` | Şartlandırıcı (filtre-regülatör-yağlayıcı) | — |
| `0V2` / `0Y1` | Tahliyeli ana valf / bobini | `V47` Ana Valf |
| `0B1` | Besleme hava basınç sensörü | `PS06` |
| `nA1` | Aktüatör (silindir, aktüatörlü vana) | aktüatörlü vanada `V01` |
| `nV1` | Yön valfi (5/2, 5/3, 3/2) | `V31 / V32` |
| `nY1`, `nY2` | Bobin 14 (aç / kaldır), bobin 12 (kapat / indir) | `V31`, `V32` |
| `nV2`, `nV3` | Tek yönlü akış kontrol (hız ayarı) | — |
| `nB1`, `nB2`, `nB3` | Manyetik piston sensörü (silindirde) veya switch box (vanada): geri/kapalı, ileri/açık, ara | `PPS13…PPS15`, `SWB01` |

`n` devre numarasıdır (her aktüatör bir devre, besleme devre 0). Şemada P&ID kodları kodun yanında **[ ] içinde** yazar (ör. `1Y1 [V31]`). Pnömatik kodu P&ID kodundan farklı en az bir bileşen varsa **Açıklama Sayfası 2: P&ID – Pnömatik Kod Eşleştirme** PDF'e mutlaka girer; bu sayfa her pnömatik kodun P&ID kodunu ve P&ID açıklamasını listeler.

Kodlar nasıl eşleşir:

- **Aç / Kapat** çifti (`V31 … Aç Valfi`, `V32 … Kapat Valfi`; Kaldırma / İndirme, Açma / Kapatma) tek valfin iki bobini olur → 5/2 çift bobinli valf.
- **Aktüatör Vanası** valfleri (`V01`) tek bobinlidir → 5/2 yay dönüşlü valf + aktüatörlü proses vanası; aynı adlı **Switch Box** (`SWB01`) vanaya sensör olarak bağlanır.
- **Piston sensörleri** (`PPS`) aynı adlı devreye bağlanır (`Lift Pistonu` = `Sepet`); **Ara** sensörü varsa valf 5/3 orta konum kapalı olur.
- **Ana Valf** (`V47`) beslemedeki tahliyeli ana valfin bobini, **hava basıncı** (`PS`) besleme sensörüdür.
- Tahmin yanlışsa Kod Eşleştirme sekmesinden düzeltin; kayıt `PNOMATIK/data/eslestirme.csv` dosyasına yazılır ve tüm projelerde kullanılır.

## Çizim ekranı

- **Otomatik Oluştur:** Projenin P&ID kodlarından (bağlı P&ID projesinin çizimi + makine kaydı) devreleri önerir. Devre adını, aktüatör ve valf tipini, her kodun rolünü ve devresini değiştirip şemayı çizdirin. A3 sayfaya 7 devre sığar; ana hat sayfa bağlantılarıyla sürer. "Yalnız eksikleri ekle" mevcut sayfalara dokunmaz.
- **P&ID Kodları sekmesi:** ★ projede olan, ✓ şemada eşleşmiş kodlar. Eşleşmemiş koda tıklamak devresini şemaya ekler; eşi şemadaysa (V31 çizili, V32 değil) aynı valfin boş bobinine ya da aktüatörün sensörüne yazar.
- **Kodu sürükleyip bırakmak:** Boş alana bırakılan kod sembolüyle ve **pnömatik koduyla** gelir: `V48` → `1V1 · 1Y1 [V48]`, `PPS05` → `3B2 [PPS05]`, `V47` → `0V1 · 0Y1 [V47]`. Devre numarası, devreden bir kod şemadaysa onunki, değilse sıradaki yeni numaradır. Valfin, silindirin veya sensörün üstüne bırakılan kod ona bağlanır (boş bobin, yeni sensör; kodsuz sembol de kod alır); sürüklerken hedef mavi çerçeveyle ve ne olacağı imlecin yanında görünür. Kodun şemada bekleyen bir yeri varsa (`V48` çizili `1V1`'in boş 12 bobini → `V49`) kod nereye bırakılırsa bırakılsın oraya yazılır; şemada olan kod ikinci kez konmaz, yeri gösterilir. Böylece sürüklenen her bileşen Açıklama Sayfası 2'de P&ID koduyla eşleşir.
- **Manyetik piston sensörleri:** Silindir sensörleri gövdeye oturan manyetik sensör olarak çizilir (temassız algılama ve mıknatıs); sensörlü silindirin pistonunda mıknatıs gösterilir. Semboller sekmesindeki **Manyetik Piston Sensörü** ve **Manyetik Piston Sensörü (PNP)** silindirin üstüne bırakılınca (ya da tıklanınca) silindirin sensörü olur: konumu bırakılan yerden (geri, ara, ileri), kodu silindirin devresinden (`nB1` geri, `nB2` ileri, `nB3` ara) gelir. Dolu konuma ikinci sensör konmaz, en yakın boş konuma geçer. Sensör tipi Özellikler'den değiştirilir; boş alana bırakılan sensör bağımsız sembol olur.
- **Sayfalar:** Alt çubuktaki **+ Sayfa** ya da sağ paneldeki **+ Yeni sayfa** aynı boyutta yeni sayfa açar; antetteki sayfa numarası (1 / 2, 2 / 2) kendiliğinden yazılır. Sayfalar arasında alt çubuktaki sekmelerle, sağ paneldeki Önceki / Sonraki sayfa düğmeleriyle ya da PageUp / PageDown ile gezilir. Sağ panelde **Çoğalt**, **Sil**, **Öne al** ve **Arkaya al** vardır; sekmedeki × de sayfayı siler, başka bir sayfa silinince bulunduğunuz sayfada kalırsınız. Seçili öğeler "Başka sayfaya taşı" ile diğer sayfaya alınır; sayfa dışına giden hat ucu boşa çıkar, Sayfa Bağlantısı sembolüyle bağlanır. Kopyadaki kodlar asıl sayfadakilerle aynıdır, Kontrol sekmesi tekrar eden kodları gösterir. Geri Al bu işlemlerin hepsini geri alır.
- **Sayfa bağlantıları:** `ŞEMA 2` gibi bağlantılar sayfayı numarasıyla gösterir ve hava hattı bu numarayla sürer. Sayfa sırası değişince (sıralama, çoğaltma, silme) numaralar kendiliğinden güncellenir. Hedef sayfası silinen bağlantı `ŞEMA ?` olur, Kontrol sekmesi uyarır; notu düzeltip yeniden bağlayın.
- **Gezinme:** Tekerlek yakınlaştırır, Shift + tekerlek yana kaydırır. **Sağ tuş basılıyken sürüklemek çizimi kaydırır** (orta tuş veya Boşluk + sol tuş da kaydırır); sağ tuşa kıpırdatmadan tıklamak yerleştirmeyi veya yarım kalan hattı iptal eder.
- **Özellikler:** Valfte bobin kodları ve P&ID valf kodları, aktüatörde konum sensörleri (kod, P&ID kodu, konum) düzenlenir. "Öner" düğmesi devreye göre boş ISO kodu verir.
- **Alt panel:** Bileşen Listesi, Bağlantı Mantığı, Güvenlik Fonksiyonları ve Kod Eşleştirme çizimle birlikte güncellenir. Bağlantı mantığı sözel yazılır: "1Y1 [V31] enerjilenince 1V1 konum değiştirir; 1A1 açılır." Güvenlik fonksiyonları ISO 4414'e göre tanınır: enerji kesilince hava tahliyesi, düşük basınç izleme, yay dönüşlü valflerde güvenli konum, çift bobinde konum koruma, 5/3 valfte ara konumda durdurma, hız sınırlama.
- **Kontrol:** Bağlanmamış bobin, P&ID'de olup şemada olmayan kod, farklı devrelerde kullanılan P&ID kodu, açık egzoz portu, tahliyeli ana valf eksikliği gibi uyarılar. PDF'e girmez.
- **Kapak / Açıklama / PDF İndir:** P&IDX ile aynı. PDF sırası: kapak, Açıklama Sayfası 1 (bileşen listesi, bağlantı mantığı, güvenlik), Açıklama Sayfası 2 (kod eşleştirme), şema sayfaları. Metinler proje diline (TR, EN, DE) uyar.

## Veriler

| Klasör / dosya | İçerik |
|---|---|
| `PNOMATIK/projects/<proje>/` | `proje.json` (P&ID projesi bağlantısı: `pidProje`), `pnomatik/cizim.json`, girdi klasörleri ve `pnomatik/cikti/` |
| `PNOMATIK/data/eslestirme.csv` | Kod Eşleştirme listesi: `KOD;DEVRE;ROL;AKTUATOR;VALF` |
| `PNOMATIK/data/pid-kod*.csv`, `pid-kodlar.json` | P&IDX bağlı değilken kullanılan P&ID kod listesi kopyası |
| `PNOMATIK/data/ayarlar.json` | Tüm projelerde geçerli seçimler (kapak tasarımı) |

## Önizleme dosyası

Klasör izni istemeden denemek için program ve P&IDX verisi tek bir HTML dosyasına gömülebilir:

```
npm run onizleme -- --pidx "../P&IDX"
```

Çıkan `onizleme.html` dosyası çift tıklayınca açılır. İçinde P&IDX kod listesi, P&ID projeleri ve makine kayıtları (salt okunur) ile en çok pnömatik kodu olan makine kaydından otomatik çizilmiş bir örnek proje bulunur (`--ornek BODYCOAT` ile başka bir kayıt seçilir). Yapılan denemeler tarayıcı hafızasında saklanır; ana ekrandaki **Önizlemeyi sıfırla** her şeyi baştaki hâline döndürür. Dosya makine kayıtlarındaki müşteri adlarını içerdiği için depoya eklenmez (`.gitignore`).

claude.ai Artifact olarak yayınlanacak sürüm için `--yayin` eklenir:

```
npm run onizleme -- --pidx "../P&IDX" --yayin --out onizleme-yayin.html
```

Bu sürümde HTML iskeleti yoktur (yayın sunucusu ekler), PDF / SVG / CSV indirme düğmeleri gizlidir ve P&ID kod listesi yalnız pnömatik serilerin (V, PPS, SWB, SW, PS) kod ve adlarını içerir. Başka firmaların logoları (ENVA, VICO, K.SYSTEM) konmaz; bu markalar seçilince antette marka adı, kapakta yer tutucu görünür.

## Test

Yalnızca geliştirme için Node.js gerekir:

```
npm test
```
