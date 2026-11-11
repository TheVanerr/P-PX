# P&PX

P&ID ve pnömatik çizim programları, tek veritabanı. Veritabanı özel bir GitHub deposudur: ücretsizdir, sunucu ve kurulum gerektirmez, her kayıt geçmişte durur. Pnömatik, P&ID verisini klasör bağlamadan okur.

## Başlatma

`index.html` dosyasını **Chrome veya Edge** ile açın (çift tık). Sunucu ya da yayın adresi yoktur.

İlk açılışta ekrandaki üç adımı izleyin (yaklaşık 3 dakika):

1. Özel depo oluşturun. Bağlantı adı (`ppx-veri`) ve görünürlüğü hazır getirir.
2. Erişim anahtarı oluşturun. "Only select repositories" altında yalnız bu depoyu seçin.
3. Anahtarı ana ekrana yapıştırıp **Bağlan** deyin. Ardından **Klasörden aktar** ile P&PX klasörünü seçin.

Başka bir bilgisayarda: program klasörünü kopyalayın ya da git ile alın, `index.html` dosyasını açın, aynı depo ve anahtarla bağlanın. Veriler kendiliğinden gelir. Veri ve program ayrı durur.

GitHub'a bağlanmadan denemek için ekrandaki **Şimdilik yalnız bu bilgisayarda kullan** seçilir; sonradan bağlanınca yapılanlar depoya gönderilir.

Kurulum yapılmamış bir tarayıcıda programlar eskisi gibi klasör izniyle çalışır. Kurulum yapıldıktan sonra `P-IDX` ve `PNOMATIKX` klasörlerindeki veri dosyaları kullanılmaz, güncel veri depodadır.

## Web uygulaması (PWA)

Program klasörü olmadan her bilgisayardan kullanmak için: site adresini Chrome ya da Edge ile açın, depo adını (`kullanici/ppx-veri`) ve erişim anahtarını girin. Adres çubuğundaki **Yükle** simgesiyle ya da ana ekrandaki **Uygulama olarak yükle** ile masaüstü uygulaması olur. İnternet yokken de açılır; kayıtlar cihazda bekler, bağlantı gelince gider.

Sitede program yoktur, yalnız giriş ekranı vardır:

- Siteyi açan, anahtar olmadan yalnız depo ve anahtar soran boş bir ekran görür. Program kodu, kod listesi ve veriler sitede bulunmaz.
- Program, özel veri deposunun `program` dalında durur. Anahtar girilince oradan indirilir ve tarayıcıda saklanır; sonraki açılışlarda yalnız değişen dosyalar iner.
- Anahtar geçersizleşirse (süresi doldu, silindi, depo erişimi kaldırıldı) bir sonraki açılışta program cihazdan silinir, giriş ekranına dönülür. Gönderilmemiş kayıtlar silinmez; yeni anahtarla girince gider.
- Ana ekrandaki **Çıkış yap** önce depoyla eşitler, sonra bu cihazdaki programı, anahtarı ve veri kopyasını siler. Ortak bilgisayarda işiniz bitince kullanın.
- Kişiye özel erişim için her kişiye ayrı anahtar verin (GitHub'da birden çok anahtar açılabilir). Bir kişinin erişimini kaldırmak için yalnız onun anahtarını silin.
- **Program verilerini güncelle** klasör sormaz, yayınlanan programdaki kod listesini ve güvenlik kataloğunu kullanır.
- Dosyadan açılış (`index.html`'e çift tık) eskisi gibi çalışır.

### Yayınlama

Program değişince (commit edildikten sonra):

```
npm run yayinla
```

Testleri çalıştırır, sonra son commit'teki program dosyalarını `ppx-veri` deposunun `program` dalına gönderir. Projeler, makine kayıtları, testler, araçlar ve belgeler gönderilmez. Veri ana daldadır, bu dala dokunulmaz. Uygulamayı açanlar bir sonraki açılışta yeni sürümü alır.

Giriş ekranı (`pwa/` klasörü) herkese açık ayrı bir depodan GitHub Pages ile yayınlanır. Yalnız `pwa/` değişince gerekir:

```
npm run kabuk-yayinla
```

İlk kurulum bir kez yapılır: GitHub'da herkese açık `ppx` deposunu oluşturun, `npm run kabuk-yayinla` deyin, deponun **Settings → Pages** bölümünde kaynak olarak `main` dalını ve `/ (root)` klasörünü seçin. Site `https://kullanici.github.io/ppx/` adresinde açılır. Kabuk commit'leri GitHub'ın gizli e-posta adresiyle atılır.

Gerçek tarayıcıda deneme (Edge ya da Chrome görünmez açılır, internete bir şey gitmez): `npm run test:tarayici`.

## Program güncellenince

Program klasörü güncellenince (git ile ya da kopyalayarak) çizim motoru ve program içindeki metinler hemen yenilenir. Kod listesi ve güvenlik kataloğu ise depodaki kopyadan okunur ve **Klasörden aktar** var olan dosyanın üzerine yazmaz. Bunları güncellemek için ana ekranda **Program verilerini güncelle** deyip P&PX klasörünü seçin:

- Yalnız `P&ID/data` altındaki kod listesi (`kod.csv`, `kod-en.csv`, `kod-de.csv`), güvenlik kataloğu (`guvenlik.csv`, `safety.csv`, `safety-de.csv`) ve katalog sürümü (`surum.json`) değişir. Projeler, makine kayıtları, ML kod listesi (`kodlar.json`), kod eşleştirme, ayarlar ve Açıklamalar sekmesinde düzenlenen metinler (`aciklamalar.json`) değişmez.
- Önce depoyla eşitlenir, sonra her dosya için değişecek, eklenecek ve silinecek kodlar gösterilir. Onaydan sonra yazılır; eski sürüm GitHub geçmişinde kalır. Yerel modda geçmiş olmadığından gerekirse önce **Yedek indir** kullanın.
- Depodaki katalog sürümü seçilen klasördekinden yeniyse (başka bilgisayar daha yeni programla güncellemiş) hiçbir şey yazılmaz. Önce o bilgisayardaki programı güncelleyin.
- **Klasörden aktar** da sonunda katalogları karşılaştırır, farklıysa aynı soruyu sorar.

Katalogları programın klasöründe düzenleyin; depoda elle yapılan değişiklik bir sonraki güncellemede programdakiyle değiştirilir. Bir katalog değişince `npm run veri-surumu` ile sürümü artırın; `npm test` unutulursa uyarır.

## Klasörler

| Yol | İçerik |
|---|---|
| `index.html` | Ana ekran: programlar, depo bağlantısı, aktarma, program verilerini güncelleme, yedek |
| `P-IDX/`, `PNOMATIKX/` | İki program |
| `ortak/` | Veritabanı (`ppx-db.js`), GitHub bağlantısı (`ppx-github.js`), klasör görünümü (`ppx-fs.js`), açılış (`ppx-boot.js`) |
| `pwa/` | Web uygulamasının giriş ekranı (kabuk): sitede yalnız bu durur |
| `tools/` | Yayınlama: `yayinla.js` (program), `kabuk-yayinla.js` (giriş ekranı) |
| `test/` | Ortak katman ve web uygulaması testleri |
| `_yedek/` | Birleştirme öncesi PNOMATIKX yedeği |
| `FARKLAR.md` | İki programın farkları ve kalan işler |

## Kayıt nasıl çalışır

- Çizim her değişiklikte önce bu cihazın tarayıcı veritabanına yazılır, internet kesilse de kaybolmaz.
- Değişenler en geç 1 dakikada bir, sayfadan çıkarken ve sayfa açılırken tek commit olarak depoya gönderilir. Ana ekrandaki **Şimdi eşitle** beklemeden gönderir.
- Sayfa kapanırken gönderim yarım kalırsa kayıt cihazda bekler, sonraki açılışta gider. Hemen başka bilgisayara geçecekseniz önce eşitleyin.
- İki cihazda aynı dosya değişirse yeni olan asıl dosya olur, eskisi yanında `.catisma-<tarih>` adıyla saklanır. Silme ile düzenleme karşılaşırsa düzenleme kalır.
- Depoda dosyalar programdaki gibi durur (`P&ID/projects/...`, `ML/kayitlar/...`). Eski bir sürüm GitHub'daki geçmişten alınabilir. Ana ekrandaki **Yedek indir** de tüm veriyi tek dosyaya alır.

## Depo sınırları

Veriler küçük olduğu için bu sınırlara yaklaşılmaz: istek hızı en çok dakikada 3 yazma isteğidir (GitHub sınırı dakikada 80, saatte 500), tek dosya sınırı 100 MB. Sınıra takılan kayıt cihazda bekler, sonra kendiliğinden gönderilir.

## Sınırlar

- **Girdi dosyaları:** Elektrik, Layout, PLC ve Katalog klasörlerindeki dosyalar aktarılır, ancak veritabanı modunda yeni dosya ekleme düğmesi henüz yok. STEP dosyaları ve 5 MB üstü dosyalar aktarılmaz, bilgisayarda kalır.
- **Çıktılar:** PDF, SVG ve Excel proje klasörüne değil, İndirilenler'e ya da seçilen yere kaydedilir.
- **Erişim anahtarı:** Yalnız bu tarayıcıda saklanır, ancak bilgisayarda açtığınız başka bir yerel HTML dosyası da onu okuyabilir. Bu yüzden anahtar yalnız `ppx-veri` deposuna izinli olmalıdır; bilinmeyen HTML dosyalarını bu tarayıcıda açmayın. Süresi dolunca ana ekrandan yenilenir.
- **Web uygulamasında anahtar:** Aynı GitHub hesabının bütün Pages siteleri (`kullanici.github.io/...`) tarayıcıda tek site sayılır ve saklanan anahtarı okuyabilir. Bu hesapta başkasının kodunu ya da dış betik çalıştıran başka bir Pages sitesi açmayın.
- **Özel depo zorunlu:** Herkese açık depoya bağlanılmaz, çünkü müşteri verisi içerir.

## Test

```
npm test
```

Üç paketi de çalıştırır: ortak katman, P&ID, pnömatik.
