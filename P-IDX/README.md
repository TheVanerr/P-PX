# P&IDX

P&ID çizim motoru ve makine kayıtları. Kurulum gerektirmez, tarayıcıda çalışır.

## Başlatma

1. `index.html` dosyasını **Chrome veya Edge** ile açın.
2. İlk açılışta `index.html`'in bulunduğu ana klasörü (`P&IDX`) seçip düzenleme izni verin.

Klasör hatırlanır, ancak tarayıcı her yeniden açıldığında izin yeniden istenir: açılan ekranda devam düğmesine, ardından tarayıcının sorusunda "İzin ver"e tıklayın. Sayfa yenilemede ve aynı oturumda açılan diğer sayfalarda sorulmaz. Firefox klasör erişimini desteklemediği için çalışmaz.

## Bölümler

| Bölüm | Nerede | Ne yapar |
|---|---|---|
| Projeler | Ana ekran | Proje açar, çizim motorunda P&ID çizer |
| Makineler | Ana ekran, sekme | Seri no bazında makine kayıtları ve kod seçimi |
| Kod Listesi | Ana ekran, sekme | Kod ekler, düzenler, CSV alır ve verir |

Aynı seri nolu proje açıldığında makine kaydı çizime bağlanır. Kodlar sekmesindeki **Taslak çiz** düğmesi makine kaydından taslak kurar: kayıttaki seviye sensörü ve rezistans kodlarına göre su tanklarını, ayrıca yıkama hücresini hazır gruplarıyla yerleştirir, grupta olup kayıtta olmayan parçaları (örneğin kayıtta PE03 yoksa pompası) çıkarır, kalan kodları sayfanın altına dizer. Sayfa gerekirse A2 veya A1 olur; çizim boş değilse taslak yeni sayfaya kurulur. Kodlar panelindeki yıldızla kod ekleyip çıkarabilir, Kontrol sekmesinde kayıt ile çizim arasındaki farkları görebilirsiniz.

## Çizim ekranı

- **Alt panel:** Bileşen Listesi, Bağlantı Mantığı ve Güvenlik Fonksiyonları tabloları çizimle birlikte güncellenir. Satıra tıklamak bileşeni çizimde gösterir.
- **Etiket Listesi (alt panel):** Çizimdeki kodlu bileşenler kod ve açıklama yan yana, Etiket Excel ile aynı sırada ve belge dilinde listelenir. Sahada telefonla etiketlemek için: **Metni kopyala** WhatsApp biçiminde metin kopyalar (kod kalın, seriler arasında boş satır; telefonda aranabilir), **Resim olarak kopyala** listeyi telefon ekranına uygun resim yapar, WhatsApp Web veya masaüstü sohbetine Ctrl+V ile yapıştırılır. **Resmi indir** PNG kaydeder, **Paylaş…** (Windows destekliyorsa) paylaşım penceresini açar. Satıra tıklamak bileşeni çizimde gösterir.
- **Yıkama hücresi:** Bırakıldığında üstte sprey manifoldu, ortada sepet, altta sepet redüktörü (GE01), sol duvarda kapak switchi (SW18) ve el koruma sensörü (SS01) gelir. Kapak switchi çizimdeki su tankı pompalarına bağlanır: kapak açıkken pompalar çalışmaz, el algılanınca durur. Tank hücreden önce ya da sonra konabilir.
- **Su tankları:** Tank kategorisinin başındaki Ön Yıkama, Yıkama, Ön Durulama ve Durulama tankları bırakıldığında ekipmanıyla gelir: sol duvarda üst ve alt seviye sensörü, tabanda yan yana 3 rezistans, üstte şebeke suyu dolum vanası (V20–V23), tankın altında (yerde) küresel vana ve pompa. Alt seviye sensörü pompayı ve rezistansları kilitler, üst seviye sensörü dolum vanasını kapatır. Pompanın basma ucu boştur, hücreye siz bağlarsınız. Kodlar kataloğun tank numarasından verilir: 1. tank Ön Yıkama (PE01, LS01/LS03, R01–R03), 2. Yıkama (PE02, LS04/LS06, R06–R08), 3. Ön Durulama (PE03), 4. Durulama (PE04); başka yerde kullanılan kod boş bırakılır. Her tank çizimde bir kez bulunur, paletteki kutusu soluklaşır; beşinci bir tank için Proses Tankı ekleyip adını yazın. Gerekmeyen parçayı silin: sinyal hattı da gider, açıklamalar kendiliğinden güncellenir.
- **Bağlantı mantığı:** Sensörü bir ekipmana bağlayınca sözel kural yazılır. Örnek: alt seviye sensörü tanka, pompa ve rezistansa bağlıysa "1. PROSES TANKI içinde su yokken PE02 ve R01 çalışmaz." Metinler proje diline (TR, EN, DE) uyar.
- **Güvenlik fonksiyonları:** Çizimdeki bağlantılardan ve `P&ID/data/guvenlik.csv` kataloğundan tanınır. Eksik korumalar (örneğin alt seviye sensörüne bağlı olmayan tank rezistansı) Kontrol sekmesinde ve panelde uyarı verir, PDF'e girmez.
- **Kapak:** Üst çubuktaki Kapak düğmesi. Bilgileri kutulardan değiştirin, üç tasarımdan (Kırmızı Bant, Üst Bant, Köşe Blok) birini seçin. Seçim `P&ID/data/ayarlar.json` dosyasına yazılır ve tüm projelerde kullanılır.
- **Açıklama:** Üst çubuktaki Açıklama düğmesi. Bileşen listesi, bağlantı mantığı ve güvenlik fonksiyonlarını çizim sayfasıyla aynı antetli A3 sayfalara dizer. Hangi tabloların gireceğini pencerenin üstünden seçin; uzun tablolar sonraki sütuna veya sayfaya "(devam)" diye geçer.
- **Sistem kodları:** Su girişi basınç sensörü `PS06`, hava girişi basınç sensörü `PS07`, hücre içi vakum `PS05`. Giriş Su ve Giriş Hava sembolleri çizimde boştaysa bu kodlarla gelir.
- **Her kodun sembolü:** Kod listesindeki 25 serinin (`LS`, `PPS`, `TC`, `SW`, `SWB`...) kendi şekli vardır; Kodlar sekmesinde her satırın yanında görünür, paletteki kutunun köşesinde seri adı yazar ve palette `LS` ya da `LS01` diye aranabilir. Boş daireye kod girilince daire o kodun sembolüne geçer; seçilmiş başka bir sembole dokunulmaz, "Önerilen sembole geç" düğmesi çıkar. Listeye eklediğiniz yeni seri adındaki sözcükten (pompa, vana, seviye...) bir sembol alır, bulunamazsa kodu yazılı genel daire olur. Eski çizimlerde genel dairedeki kodlu enstrümanlar açılışta kendi sembolüne geçer; revizyon kaydı olan belgeler değiştirilmez.
- **Piston ve sensörleri:** Sembollerdeki "Piston ve Piston Sensörleri" kategorisinde çift etkili, yaylı tek etkili, çift milli ve 3 konumlu lift pistonu ile piston sensörleri (genel, açık, ara, kapalı) vardır. Sensörlü Piston bırakılınca açık ve kapalı sensör sinyal hatlarıyla birlikte gelir. `PPS` kodları bu sensör sembolleriyle konur. Aynı sensörlerin ISA-5.1 gösterimi de vardır: daire içinde ZS, ZSO, ZSM, ZSC harfi ve altında kod. Bunlar da konum sensörü sayılır; kod girilince silindir gövdeli sembole geçmez.
- **Temel şekiller:** "Temel Şekiller" kategorisinde dikdörtgen, kare, üçgen, daire, elips ve eşkenar dörtgen vardır. Köşelerinden boyutlanır, içleri boştur, kenarından seçilir; Etiket alanına yazılan yazı ortada görünür. Bileşen listesine ve bağlantı mantığına girmez, kod istemez.
- **Sembol listesi:** Kod listesindeki her bileşen türünün kutusu var: seviye (alt, orta, üst), sıcaklık, basınç (4-20 mA, su, hava, vakum, şalter), pH, iletkenlik, akış, kapak switchi, prox, vana switch box, buton, lamba; Elektrik ve Koruma kategorisinde termik/MKŞ, sigorta, kaçak akım rölesi; ayrıca ultrasonik jeneratör ve transdüser. Kod koyduktan sonra seçilir. Kodlar sekmesinden konan kodlar da bu sembolleri kullanır.
- **Dolum Solenoid Valfi:** Vanalar kategorisinde, otomatik dolum için. Hat yönünden bağımsız olarak her zaman dolum vanası sayılır: alt seviye sensörüne bağlanınca "su yokken açılır, tanka su alınır", üst seviye sensörüne bağlanınca "seviye üst sınıra ulaştığında kapanır, taşma önlenir" yazılır. Kodlar sekmesinden konan SWB46/SWB47 (Tank Otomatik Dolum Solenoid Vanası) bu sembolle gelir. Su tankı grubundaki aktüatörlü dolum vanası, sağ paneldeki Sembol listesinden bu valfle değiştirilebilir.
- **Pistonlu Tahliye Vanası:** Vanalar kategorisinde; hattaki vana, üstünde silindir gövdesi ve piston, piston kolu vanaya iner. Tek parça olarak hatta bırakılır, ayrıca vana ve kare çizmek gerekmez. Silindirin iki yanındaki uçlara açık/kapalı piston sensörleri (ZSO, ZSC) sinyal hattıyla bağlanır, üst uç hava girişidir. Hücreden tanka dönüş ya da drenaj olduğu hat yönünden anlaşılır.
- **Dozatron:** Pompa ve Fanlar kategorisinde, su akışıyla çalışan elektriksiz oransal dozaj ünitesi. Hatta tek parça oturur; alttaki uç kimyasal emiş hortumudur, kimyasal bidonuna buradan bağlanır. Motor bağlantısı yoktur. Kod ve not gövdenin üstüne yazılır. Akış cümlesinde "suya ayarlı oranda kimyasal katar" diye geçer. Adında "dozatron" geçen kodlar bu sembolle konur.
- **Belge dili:** Kapak ve Açıklama pencerelerinin üstündeki TR / EN / DE düğmeleri kapak, açıklama sayfası ve çizimin dilini değiştirir; program arayüzü Türkçe kalır. Varsayılan adlar (PROSES TANKI, DRENAJ, P&ID Şeması gibi) da çevrilir, sizin yazdığınız adlar olduğu gibi kalır. Kod listesinde EN veya DE karşılığı olmayan kodlar Kontrol sekmesinde listelenir (belge o dildeyse uyarı olarak), PDF Türkçe satırla çıkmadan önce `kod-en.csv` / `kod-de.csv` dosyasına eklenebilir.
- **Sayfalar:** Alt çubuktaki **+ Sayfa** yeni sayfa açar; antetteki sayfa numarası (1 / 2, 2 / 2) ve altbilgi kendiliğinden yazılır, PDF'te de sırayla numaralanır. Sayfalar arasında alt çubuktaki sekmelerle, sağ paneldeki Önceki / Sonraki sayfa düğmeleriyle ya da PageUp / PageDown ile gezilir. Sağ panelde çoğaltma ve silmenin yanında sayfanın sırasını değiştiren Öne al / Arkaya al düğmeleri vardır; sekmeye çift tıklamak sayfa adını düzenletir. Geri Al değişikliğin yapıldığı sayfaya geçer. Seçili öğeler "Başka sayfaya taşı" ile diğer sayfaya alınır; sayfa dışına giden hat ucu boşa çıkar, Sayfa Bağlantısı sembolüyle bağlanır.
- **Gezinme:** Farenin sağ tuşuna basılı tutup sürükleyerek (ya da orta tuş, Boşluk + sürükle) çizimi kaydırın. Sürüklemeden sağ tıklamak yerleştirmeyi veya yarım hattı iptal eder.
- **Boyut:** Sembol seçiliyken sağ paneldeki "Boyut (%)" asıl boyutun yüzdesini ayarlar (`70` ya da `%70` yazılır, %30 ile %400 arası). Birden çok öğe seçiliyken "Doğrudan boyut (%)" aynısını hepsine uygular, Küçült / Büyüt (ya da `[` ve `]`) her öğeyi %10 değiştirir; "Aralıklar da ölçeklensin" (Shift) açıksa grup ortasına göre birlikte küçülür. Tank ve hücrede genişlik ile yükseklik, yazıda punto değişir. Aralıklarla ölçeklenince seçimin içindeki hatlar şeklini korur; öbür hatlar yeniden yönlenir.
- **Gruplama:** Birden çok öğe seçip Grupla (Ctrl+G). Gruba seçilen her şey girer: sembol, yazı, lejant ve hatlar. Seçilmemiş olsa da iki ucu gruptaki hatlar, bir ucu grupta öbür ucu boşta olan hatlar ve aradaki dal noktaları da gruba katılır; sonradan grubun içine çizilen hat ve gruptaki hatta konan vana da gruba girer. Grup katı bir parça gibi taşınır (fare, ok tuşları): hatların şekli aynen kalır, yalnız grubun dışındaki bir sembole giden hatlar uzar, kısalır. Gruptaki bir parçaya tıklamak bütün grubu seçer, seçili gruba bir daha tıklamak yalnız o parçayı seçer. Grubu çöz: Ctrl+Shift+G. Su tankı, hücre ve sensörlü piston grupları hatlarıyla gruplanmış gelir. Eski çizimlerin grupları açılışta hatlarıyla tamamlanır; görünüşleri değişmez.
- **Revizyon işaretleri:** Sağ paneldeki "Revizyon ekle" çizimin o anki hâlini saklar. Bir önceki revizyondan bu yana değişen, eklenen veya silinen her şey bulutla çevrilir ve son revizyonun numarası üçgen içinde yazılır; silinenler eski yerinde gösterilir. Revizyonu başlarken ya da yayınlarken eklemeniz yeterli. Alt çubuktaki "Revizyon" kutusu işaretleri gizler; gizliyse PDF'e de girmez.
- **PDF İndir:** Sıra kapak, açıklama sayfaları, çizim sayfalarıdır; istediğiniz bölümleri seçin. Kapak numarasızdır, diğer sayfalar baştan sona tek sırada numaralanır ve kapaktaki sayfa sayısı buna göre yazılır. Birden çok dil seçilirse her dil kapağıyla birlikte tam belge olarak TR, EN, DE sırasıyla tek dosyada arka arkaya birleşir. Dosya doğrudan İndirilenler klasörüne iner; yazdırma penceresi açılmaz, Adobe veya başka bir yazıcıya uğramaz. Sayfalar vektör kalır, metin seçilip aranabilir. Yazı tipleri programla gelir ve PDF'e gömülür (`P&ID/assets/fonts`): Calibri yerine ölçüleri aynı Carlito, Segoe UI yerine Selawik.
- **Etiket Excel:** Çizimdeki kodları `ML/MAKİNE ETİKETLEME.xlsx` dosyanızın düzeninde (başlık, "Kullanılan Bileşen / KOD" sütunları, aynı yazı tipi, kenarlık ve satır yükseklikleri) yeni bir Excel dosyasına yazar. Adlar belge dilindedir, kodlar şablondaki sıraya dizilir (pompa, fan, rezistans, ısı, seviye, vana, sensör...). Sayfa başına 80 kod sığar, fazlası ikinci sayfaya geçer. Şablon dosyası değiştirilmez.
- **Kaydet:** Çizim her değişiklikte otomatik kaydedilir; düğme ve Ctrl+S hemen yazar. Veritabanı yoktur, her şey proje klasöründeki dosyalardadır.

## Veriler

| Klasör | İçerik |
|---|---|
| `P&ID/projects/<proje>/` | `proje.json`, `pid/cizim.json`, girdi dosyaları ve `pid/cikti/` |
| `ML/kayitlar/` | Makine kayıtları (`<seri no>.json`) ve kod listesi (`kodlar.json`) |
| `P&ID/data/` | Çok dilli kod ve güvenlik katalogları |

`ML/KODListesi.csv` yalnızca `kodlar.json` yoksa başlangıç kaynağı olarak okunur. Program güncel listeyi `kodlar.json`'a yazar, CSV'ye Kod Listesi sekmesinden aktarılır.

## Tarayıcıdan gelen sınırlar

- **PDF:** "PDF İndir" dosyayı tarayıcının İndirilenler klasörüne indirir, pencere açmaz. İndirildikten sonra Adobe kendiliğinden açılıyorsa bu tarayıcının "bu tür dosyaları her zaman aç" ayarıdır; indirilenler listesinden kapatılır.
- **Proje dosyaları:** PDF, resim ve metin dosyaları yeni sekmede açılır. Tarayıcı dış program başlatamadığı için STEP, Excel gibi dosyaların kopyası indirilir; asıl dosyayı klasöründen açın.

## Web sürümü

Program claude.ai üzerinde bir web sayfası (artifact) olarak da yayınlanır; kurulum ve klasör izni gerekmez. Projeler, makine kayıtları ve kod listesi depodaki hâlden başlar. Web'de kaydedilenler sayfanın veritabanına yazılır, açılışta depodaki dosyaların üstüne bindirilir ve her cihazda görünür. Bilgisayardaki klasörle otomatik eşitlenmez: web'deki değişikliklerin depoya alınması istenirse veritabanından okunup dosyalara yazılır. Web'de PDF yazdırma ve dosya indirme (PDF, SVG, Etiket Excel) çalışmaz; bunlar için programı bilgisayarda açın.

Paket `node tools/web/build.js` ile `.web-build/` klasörüne üretilir.

## Test

Yalnızca geliştirme için Node.js gerekir:

```
npm test
```
