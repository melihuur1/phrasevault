[🇹🇷 Türkçe](README.md) | [🇬🇧 English](README.en.md)

# PhraseVault

PhraseVault, İngilizce metinlerin ekran görüntülerini yapay zekâ ile açıklanmış, numaralı ifade notlarına dönüştüren bir Obsidian masaüstü eklentisidir. Türkçe konuşanlar için tasarlanmıştır.

Bir altyazının, makalenin ya da sohbetin ekran görüntüsünü alın (Win+Shift+S) ve PhraseVault'a yapıştırın. Claude öğrenmeye değer ifadeleri önerir: phrasal verb'ler, deyimler, eşdizimler (collocation), kalıp ifadeler ve *be meant to* gibi dilbilgisi kalıpları. Her önerinin yanında ifadenin o cümledeki anlamı, kısa bir kullanım notu, cümlenin Türkçe çevirisi ve işe yaradığı durumlarda ek bir örnek bulunur. Önerileri inceleyip düzenlersiniz; PhraseVault da her birini numaralı bir not olarak kaydeder (`Phrases/0001.md`, …) ve giderek büyüyen `INDEX.md` dosyasına ekler.

Arayüz Türkçedir. Eklenti yapay zekâ sağlayıcısı olarak yalnızca Anthropic API'yi kullanır ve sizin kendi API anahtarınızla çalışır.

<!--
Ekran görüntüleri: docs/screenshots/README.md dosyasına bakın, ardından bu yorumu kaldırın.

![Ekran görüntüsü önizlemesiyle içe aktarma penceresi](docs/screenshots/preview.png)
![Tahmini maliyetle birlikte düzenlenebilir öneri kartları](docs/screenshots/review.png)
![Okuma görünümünde INDEX.md](docs/screenshots/index.png)
-->

## Özellikler

- **Ekran görüntüsünü içe aktarmanın üç yolu:** panoyu okuyun, pencere içindeyken Ctrl+V'ye basın ya da bir PNG/JPEG dosyası seçin.
- **Önce önizleme.** **Analiz et**'e tıklayana kadar bilgisayarınızdan hiçbir şey çıkmaz. Analiz iptal edilebilir; aynı oturumda aynı ekran görüntüsü yeniden gösterildiğinde ne ikinci kez gönderilir ne de ikinci kez ücretlendirilir.
- **Yalnızca en bariz deyim değil, işe yarayan her ifade.** Claude her cümlede gerçekten işe yarayan tüm çok sözcüklü ifadeleri arar: dilbilgisi kalıpları, yan yana duran ya da birbiriyle örtüşen ifadeler ("None of them were meant to make it" → *be meant to* ve *make it*) ve daha uzun bir yapının içine yerleşmiş ifadeler ("looking forward to hearing from her" → *look forward to* ve *hear from someone*). İfadeler tam biçimleriyle verilir (*put behind* değil, *put something behind you*). En fazla sekiz öneri döner, ama yalnızca öğrenmeye değer olanlar kadar; aday daha fazlaysa önce *have to* gibi genel yapılar elenir.
- **Vurgulu ve düz metin.** Ekran görüntüsünü almadan önce bir ifadeyi vurgular ya da altını çizerseniz, o ifade listenin en başında yer alır.
- **Her ifade için öğrenme ayrıntıları:**
  - bu cümlede ne anlama geldiği
  - nasıl kullanıldığı (kalıbı, ardından ne geldiği, üslubu)
  - cümlenin doğal bir Türkçe çevirisi
  - isteğe bağlı, çevirisiyle birlikte ek bir örnek; yapay zekâ tarafından üretildiği açıkça belirtilir
  - görünen metin anlamı netleştirmediğinde, tahmin yürütmek yerine bir bağlam notu
- **Derli toplu, düzenlenebilir öneri kartları.** Her kart ifadeyi, kategorisini, Türkçe anlamını ve kaynak cümleyi gösterir. Geri kalan her şey **Ayrıntılar** altında katlanmış durumdadır ve orada da düzenlenebilir. Bir kartı atlamak için işaretini kaldırın; yapay zekâ bir ifadeyi kaçırdığında ya da analiz başarısız olduğunda ifadeyi elle ekleyin.
- **Yapay zekânın söylediklerine yönelik denetimler.**
  - Alıntılanan ifade kaynak cümlede geçmiyorsa uyarı gösterilir.
  - Ekran görüntüsündeki metni olduğu gibi tekrarlayan bir "örnek" atılır.
  - Aynı cümledeki daha uzun bir ifadenin yalnızca parçası olan bir öneri (*pick up the slack* içindeki *pick up*) işaretsiz başlar ve nedeni bir notla belirtilir. Claude sekizden fazla öneri döndürürse ilk elenenler bu parçalardır.
- **Yinelenen ifade tespiti.** Notlarınızda ya da `INDEX.md`'de zaten bulunan veya aynı kayıt işleminde birden fazla kez geçen ifadeler işaretlenir. Yinelenen bir ifadeyi kaydetmek için ayrıca "Farklı anlamla yine de kaydet" onayı gerekir.
- **Güvenli, sıralı numaralandırma.** Numaralar asla yeniden kullanılmaz, mevcut notların üzerine asla yazılmaz ve `INDEX.md`'ye yalnızca yeni satır eklenir. Numaralar okuma görünümünde (Reading view) baştaki sıfırlarını korur ve 9999'dan sonra da devam eder.
- **Her ekran görüntüsünden tek kopya.** Ekran görüntüsü `Attachments/` klasörüne bir kez kaydedilir ve ondan oluşturulan her nota gömülür.
- **Her analizin tahmini maliyeti.** Öneri ekranı kullanılan token'ları ve tahmini maliyeti gösterir; ayarlarda ise sıfırlayabileceğiniz birikimli bir toplam tutulur.
- **"İndeksi onar".** Mevcut notlar için `INDEX.md`'de eksik olan girdileri geri ekler; belirsiz durumlarda tahmin yürütmek yerine bunları raporlar.
- **Düzenlemeler kaybolmaz.** Kaydedilmemiş düzenlemeler varken pencereyi kapatmak ya da baştan başlamak önce onay ister.

## Nasıl çalışır

1. **Win+Shift+S** ile ekran görüntüsü alın.
2. Komut paletinden **PhraseVault: Panodan ekran görüntüsü içe aktar** komutunu çalıştırın ya da kenar şeridindeki (ribbon) simgeye tıklayın. Bir önizleme ve sıradaki ifadeye verilecek numara görünür.
3. **Analiz et**'e tıklayın ya da Enter'a basın. Claude önerileri birkaç saniye içinde döndürür.
4. İfadeleri düzenleyin, seçin ya da yenilerini ekleyin; ardından **Seçilenleri kaydet**'e tıklayın ya da Ctrl+Enter'a basın.

Bunun sonucunda örneğin şu dosyalar oluşur:

```
INDEX.md
Phrases/0001.md
Phrases/0002.md
Attachments/pv-3f9a1c2b7d10e4a5.png
```

`INDEX.md`'ye kaydedilen her ifade için bir satır eklenir:

```markdown
# PhraseVault İndeksi

0001 — [[Phrases/0001|come across]]
0002 — [[Phrases/0002|put off]]
```

Her not, temel verileri frontmatter'ında (özellikler) ve öğrenme içeriğinin tamamını gövdesinde tutar. Ekran görüntüsünden gelen metin ile yapay zekânın ürettiği metin ayrı ayrı etiketlenir:

```markdown
---
phrase: "be meant to"
original_text: "were meant to"
category: "grammar_pattern"
meaning_tr: "-mesi beklenmek"
source_sentence: "None of them were meant to make it, but they did."
screenshot: "[[Attachments/pv-3f9a1c2b7d10e4a5.png]]"
created: "2026-11-18"
number: 2
tags:
  - phrasevault
---
# be meant to

**Kategori:** Dilbilgisi kalıbı
**Türkçe anlam:** -mesi beklenmek
**Bu cümlede:** Hiçbirinin başarmasının beklenmediğini anlatıyor; "but they did" bu beklentinin boşa çıktığını gösteriyor.
**Kullanım:** be meant to + yalın fiil. Geçmişte (was/were meant to) çoğu zaman gerçekleşmeyen bir beklentidir.

**Ekran görüntüsündeki cümle:**
> None of them **were meant to** make it, but they did.

**Cümlenin Türkçesi:** Hiçbirinin başarması beklenmiyordu ama başardılar.

**Ek örnek (yapay zekâ tarafından üretildi):** This room was meant to be a library.
**Örneğin Türkçesi:** Bu odanın kütüphane olması planlanmıştı.

![[Attachments/pv-3f9a1c2b7d10e4a5.png]]

*Eklenme tarihi: 2026-11-18*
```

### Komutlar

| Komut | Ne yapar |
|---|---|
| Panodan ekran görüntüsü içe aktar | Panodaki ekran görüntüsünü içe aktarır (kenar şeridindeki simge de aynı işi yapar) |
| Dosyadan ekran görüntüsü içe aktar | Bir PNG/JPEG dosyasını içe aktarır |
| Klasör yapısını ve INDEX.md dosyasını hazırla | Eksikse `Phrases/`, `Attachments/` ve `INDEX.md`'yi oluşturur |
| İndeksi onar | Notları `INDEX.md` ile karşılaştırır, düzeltmeleri önizletir ve eksik girdileri ekler |

Varsayılan kısayol tuşu atanmamıştır. Kendi kısayollarınızı **Settings → Hotkeys** altında belirleyebilirsiniz.

## Kurulum

Masaüstünde (Windows, macOS, Linux) Obsidian **1.11.4 veya üstü** gerekir.

PhraseVault henüz Topluluk Eklentileri (Community Plugins) dizininde yer almıyor. O zamana kadar eklentiyi elle kurabilirsiniz:

1. En son GitHub sürümünden (release) `main.js`, `manifest.json` ve `styles.css` dosyalarını indirin.
2. `<your vault>/.obsidian/plugins/phrasevault/` klasörünü oluşturun (`<your vault>`, Obsidian kasanızın (vault) klasörüdür) ve üç dosyayı bu klasöre koyun.
3. Obsidian'da **Settings → Community plugins** bölümüne gidin, gerekirse Restricted mode'u kapatın ve **PhraseVault**'u etkinleştirin.

Güncellemeleri otomatik olarak almak isterseniz bunun yerine depoyu [BRAT](https://github.com/TfTHacker/obsidian42-brat) eklentisine ekleyebilirsiniz.

> Bu belgedeki Obsidian menü adları, Obsidian'ın İngilizce arayüzündeki hâlleriyle verilmiştir. PhraseVault'un kendi komut ve ayar adları ise eklentide göründüğü gibi Türkçedir.

## Anthropic API yapılandırması

PhraseVault, varsayılan olarak Anthropic Messages API'yi **Claude Haiku 5.5** (`claude-haiku-5-5`) modeliyle çağırır. Kendi API anahtarınıza ihtiyacınız vardır. **Claude Pro veya Max aboneliği API kullanımını kapsamaz.**

1. [console.anthropic.com](https://console.anthropic.com) adresinde bir hesap oluşturun ve **Billing** bölümünden ön ödemeli kredi yükleyin. Düşük bir aylık harcama limiti belirlemeniz önerilir.
2. **API keys** bölümünden bir API anahtarı oluşturun.
3. Obsidian'da **Settings → PhraseVault → Anthropic API anahtarı** bölümüne gidin, yeni bir gizli anahtar (secret) oluşturun ve API anahtarınızı içine yapıştırın.

Anahtar, Obsidian'ın gizli anahtar deposunda (secret storage) saklanır. PhraseVault'un kendi ayar dosyası yalnızca bu gizli anahtarın *adını* tutar. Masaüstünde gizli anahtar deposu her kasa için ayrıdır; bu yüzden bir test kasasına ve asıl kasanıza anahtarı ayrı ayrı girmeniz gerekir.

**Model** ayarı değiştirilebilir. Tahmini maliyet Claude Haiku 5.5, Sonnet 5.5 ve Opus 5.5 için hesaplanır. Diğer modeller de çalışır, ancak maliyetleri "Maliyet hesaplanamadı" olarak görünür.

## API maliyetleri ve maliyet takibi

Standart API'de Claude Haiku 5.5 fiyatları, 2026-11-18 tarihinde [resmî fiyatlandırma sayfasıyla](https://platform.claude.com/docs/en/about-claude/pricing) karşılaştırılarak doğrulanmıştır:

| Milyon token başına | 100K token'a kadar istemler | 100K token'ı aşan istemler |
|---|---|---|
| Girdi | $0.10 | $0.50 |
| Çıktı | $0.50 | $2.50 |
| 5 dakikalık önbelleğe yazma | $0.125 | $0.625 |
| 1 saatlik önbelleğe yazma | $0.20 | $1.00 |
| Önbellekten okuma | $0.01 | $0.05 |

Tipik bir ekran görüntüsü analizi birkaç bin girdi token'ı (görüntü ve sabit talimatlar) ve birkaç bin çıktı token'ı kullanır; çıktıya modelin düşünme adımları (orta düzey, *medium effort*) ve öğrenme ayrıntıları dahildir. Bu da **analiz başına yaklaşık $0.002–0.004** eder; her analizin gerçek tutarı öneri ekranında gösterilir.

### Tahmin nasıl hesaplanır

PhraseVault her yanıttan sonra API'nin döndürdüğü `usage` nesnesini okur; girdi ve çıktı token'larını, modeli ve altı ondalık basamaklı tahmini maliyeti gösterir (örneğin `Tahmini maliyet: $0.000813`).

- **Token sayıları yalnızca API yanıtından alınır.** Görüntü token'ları zaten `input_tokens`, düşünme token'ları da `output_tokens` içinde yer alır; bu yüzden ikisi de ayrıca tahmin edilmez ya da eklenmez.
- **Önbelleğe yazma ve önbellekten okuma**, yanıt bunları bildirdiğinde **ayrı fiyatlandırılır**. Önbellek okuma ve yazmaları dahil istemin tamamı 100.000 token'ı aştığında uzun bağlam fiyatları uygulanır.
- **Yalnızca ABD'de çıkarım (US-only inference)**, yanıt `inference_geo: "us"` bildirdiğinde **1,1 katı** üzerinden fiyatlandırılır.
- **Tutarlar tam sayı pikodolar olarak saklanır** ve yalnızca gösterilirken yuvarlanır; böylece toplamlar zamanla kaymaz.
- **Ücretlendirilen başarısız istekler de sayılır.** Reddedilen, yarıda kesilen ya da geçersiz bir yanıt yine de ücretlendirildiği için kaydedilir.
- **Hiçbir şey iki kez sayılmaz.** Her yanıt, mesaj kimliğine (message ID) göre bir kez kaydedilir. Oturum önbelleğinden yeniden açılan bir sonuç ilk tahmini yeniden gösterir, ama tekrar sayılmaz.
- **Tahmin yürütülmez.** Kullanım bilgisi eksikse, modelin bilinen bir fiyatı yoksa ya da istek PhraseVault'un fiyat bilgisine sahip olmadığı bir katmanda, hız modunda veya bölgede çalıştıysa `$0` yerine "Maliyet hesaplanamadı" görünür.

Yerel geçmiş (`data.json` içinde) birikimli bir toplamı ve son 50 kaydı tutar: tarih, model, token sayıları ve tahmin. Görüntüleri, istemleri, yanıtları ya da anahtarları asla saklamaz. **Settings → PhraseVault → Geçmişi sıfırla** ile sıfırlanabilir.

### Tahminin sınırlamaları

- Gösterilen tutar faturanız değil, **yerel bir tahmindir ("Tahmini maliyet")**. Kesin tutar Anthropic Console'da yer alır.
- Fiyatlar değişebilir. Fiyatlar, kontrol edildikleri tarihle birlikte `src/core/cost.ts` içinde sabit olarak tutulur.
- İptal edilen ya da zaman aşımına uğrayan bir isteğin yanıtı olmadığı için kullanımı görülemez ve sayılamaz; Anthropic bu isteği yine de ücretlendirebilir.
- SDK başarısız istekleri en fazla iki kez yeniden dener. Yalnızca son yanıtın kullanımı bildirilir. Hız sınırı (rate limit) ve aşırı yük (overload) gibi başarısız denemeler normalde ücretlendirilmez.

## Gizlilik ve yerel veriler

**Ne gönderilir, ne zaman:** yalnızca önizlediğiniz ekran görüntüsü (gerekirse en fazla 2576 piksele küçültülerek) ve sabit bir talimat metni. Bunlar yalnızca **Analiz et**'e tıkladığınızda, HTTPS üzerinden ve yalnızca `api.anthropic.com` adresine gönderilir, başka hiçbir yere gönderilmez. Kasanızdaki başka hiçbir içerik (notlar, dosya adları, `INDEX.md`) asla gönderilmez. Ekran görüntüleri kişisel bilgi içerebilir; göndermeden önce önizlemeyi kontrol edin.

**Anthropic tarafında:** API verileri Anthropic'in [ticari koşulları ve gizlilik politikası](https://www.anthropic.com/legal/privacy) kapsamında işlenir. Bu koşullara göre API girdileri ve çıktıları varsayılan olarak model eğitiminde kullanılmaz.

**Bilgisayarınızda kalanlar:**

| Konum | İçerik |
|---|---|
| `Phrases/*.md`, `INDEX.md`, `Attachments/` | Notlarınız ve ekran görüntüleriniz, sıradan kasa dosyaları olarak |
| `.obsidian/plugins/phrasevault/data.json` | Gizli anahtarın adı, model kimliği, verilen en yüksek numara, maliyet geçmişi (yalnızca token sayıları) |
| Obsidian gizli anahtar deposu | API anahtarı |
| Yalnızca bellek | Aynı ekran görüntüsü iki kez ücretlendirilmesin diye bu oturumdaki son 20 analiz. Obsidian kapandığında silinir. |

Telemetri, kullanım analitiği ya da bize ait bir sunucu yoktur.

## Mimari

```
Command / ribbon ──► ImportModal (UI state machine)
                       ├─ clipboard.ts      clipboard read · Ctrl+V · file picker
                       ├─ core/imageInput   format, dimensions, hash, resize plan, final API-image checks
                       ├─ ai/analyze        Anthropic Messages API: image + fixed prompt, structured JSON output
                       │    └─ ai/validate  schema check, cleanup, source-sentence check
                       ├─ core/cost         usage → estimated cost;  core/usageLog  local history
                       ├─ ui/reviewModel    selection, required fields, duplicates, unsaved changes
                       └─ vault/vaultStore  serialized saves through a small VaultPort
                            ├─ core/numbering     next = max(note files, INDEX.md references, last issued) + 1
                            ├─ core/noteMarkdown  note text
                            ├─ core/indexFile     append-only INDEX.md, checked again at write time
                            └─ core/indexRepair   "İndeksi onar" planning
```

- **`src/core/` saf TypeScript'tir** ve Obsidian'dan hiçbir şey içe aktarmaz; bu sayede numaralandırma, indeks işlemleri, not oluşturma, yinelenen ifade tespiti, görüntü denetimleri ve maliyet hesabının tamamı birim testleriyle sınanır.
- **Kasaya erişim `VaultPort` üzerinden yapılır.** `VaultPort` küçük bir arayüzdür: `obsidianVaultPort.ts` Obsidian'ın `app.vault` nesnesini bu arayüze uyarlar; testler ise hata ve yarış durumu (race condition) kancaları olan, bellekte çalışan sahte bir kasa kullanır.
- **Kasanız için güvenlik kuralları:**
  - Notlar ve ekler yalnızca *oluşturulur* (yol zaten varsa `vault.create` başarısız olur).
  - `INDEX.md` yalnızca `vault.process` ile değiştirilir. Yeni içerik geri çağırma (callback) içinde yeniden denetlenir; mevcut satırlar asla düzenlenmez, yeniden sıralanmaz ya da silinmez.
  - Bir not, indeks satırından önce yazılır. Böylece bir hata en kötü ihtimalle indeks girdisi olmayan bir not bırakabilir; bunu da "İndeksi onar" düzeltir.
- **Numaralandırma**, kasada bulunanlardan ve verilen en yüksek numarayı tutan tek bir kayıttan (high-water mark) türetilir. Bu sayede yeniden başlatmadan sonra da aynı kalır ve silinmiş ya da elle düzenlenmiş bir girdinin numarası asla yeniden kullanılmaz.
- **Yapay zekâ çağrısı dışarıdan verilir (injected).** Anthropic çağrısı, testlerde sahte (mock) bir sürümle değiştirilen bir fonksiyondur. İstemci her zaman `https://api.anthropic.com` adresini kullanır ve SDK günlükleri kapalıdır; böylece ortam değişkenleri istekleri başka bir yere yönlendiremez ya da günlüğe yazdıramaz.

## Geliştirme

Gereksinimler: Node.js 22.12+ ve Obsidian 1.11.4+ (masaüstü).

```bash
npm install
npm run dev        # watch build; copies the plugin into ./dev-vault
npm run build:dev  # one development build into ./dev-vault (adds a free sample-response button)
npm test           # unit and integration tests; network access is blocked, no API key needed
npm run typecheck
npm run lint
npm run build      # type-check + production bundle (main.js)
```

Komutların kısa açıklaması:

- `npm run dev`: değişiklikleri izleyerek derler ve eklentiyi `./dev-vault` içine kopyalar.
- `npm run build:dev`: `./dev-vault` için tek seferlik bir geliştirme derlemesi yapar (ücretsiz bir örnek yanıt düğmesi ekler).
- `npm test`: birim ve entegrasyon testlerini çalıştırır; ağ erişimi engellidir, API anahtarı gerekmez.
- `npm run build`: tür denetimi yapar ve üretim paketini (`main.js`) oluşturur.

`./dev-vault` klasörünü Obsidian'da **Open folder as vault** ile açın, ardından topluluk eklentilerini bir kez etkinleştirin. Bu kasa, silinip yeniden oluşturulabilecek bir test kasasıdır, git tarafından yok sayılır (gitignore) ve geliştirme betiklerinin yazdığı tek kasadır. Kurulum betiği depo dışındaki hiçbir hedefe yazmayı kabul etmez.

**Testler** şunları kapsar: numaralandırma, indeks, not oluşturma, yinelenen ifadeler, görüntü doğrulama, yapay zekâ yanıt şeması ve hataları (sahte yanıtlarla), maliyet hesabı ve kullanım geçmişi, inceleme mantığı, indeks onarımı ve bellekteki bir kasa üzerinde baştan sona kaydetme akışları. `tests/ai/` içindeki regresyon testleri, `tests/fixtures/ai/` içindeki örnek yanıtlarla birlikte şunları kapsar: kaçırılmış bir dilbilgisi kalıbı (*be meant to* + *make it*), örtüşen ifadeler ile gereksiz iç içe parçaların ayrımı, sekiz öneri sınırında elenmemesi gereken iç içe bir ifade (*hear from someone*), belirsiz bir bağlam ve üretilmiş örneklerle birlikte çeviriler. `tests/setup.ts`, `fetch`, `XMLHttpRequest` ve `WebSocket`'i çağrıldığında hata fırlatan taklitlerle değiştirir; böylece test paketi asla ücretli bir istek yapamaz.

**Sürümler:** sürümü `npm version <x.y.z>` ile yükseltin (bu komut `manifest.json` ve `versions.json` dosyalarını da günceller), ardından etiketi (tag) GitHub'a gönderin (push). Sürüm iş akışı (release workflow) eklentiyi derler ve `main.js`, `manifest.json` ve `styles.css` dosyalarını taslak (draft) bir GitHub sürümüne ekler.

## Bilinen sınırlamalar

- **Yalnızca masaüstü.** İş akışı masaüstü ekran görüntüleri üzerine kuruludur; mobil desteklenmez.
- **Yapay zekâ metni yanlış okuyabilir,** bir vurguyu ya da dilbilgisi kalıbını kaçırabilir veya bir şeyi tam doğru açıklamayabilir. Bu yüzden her öneri incelenir ve düzenlenebilir; kaynak cümleyle uyuşmazlıklar da işaretlenir. Otomatik testler, modelin yanıtlarının ne kadar iyi olduğunu değil, yanıtların nasıl işlendiğini denetler; yanıt kalitesi elle kontrol edilir.
- **Parça tespiti yalnızca bir ipucudur.** Bir önerinin hem ifadesi hem de metindeki yazılışı, aynı cümleden daha uzun bir önerinin içinde yer alıyorsa öneri o uzun önerinin parçası olarak işaretlenir. Öneri yalnızca işaretsiz bırakılır, yani isterseniz yine de seçip kaydedebilirsiniz; listeden yalnızca sekizden fazla öneri olduğunda çıkarılır.
- **Arayüz dili:** arayüz ve açıklamalar yalnızca Türkçedir.
- **`INDEX.md`'de her girdinin ayrı satırda görünmesi**, Obsidian'ın varsayılan *Strict line breaks: off* ayarına bağlıdır. Bu ayar açıksa okuma görünümü satırları birleştirir; dosyanın kendisi etkilenmez.
- **Yinelenen ifade tespiti**, not özelliklerindeki `phrase` değerini ve `INDEX.md` bağlantılarının takma adlarını (alias) karşılaştırır. Bunlar olmadan elle yazılmış notlar tanınmaz.
- **Senkronizasyon:** aynı kasanın iki cihazdan aynı anda kaydedilmesine karşı koruma, yalnızca dosyaların üzerine yazılmadan oluşturulması ve `INDEX.md`'nin yazma anında yeniden denetlenmesinden ibarettir.
- **Pano:** pano `navigator.clipboard.read()` ile okunur. Sistem buna izin vermezse pencere içinde Ctrl+V ve dosya seçici yine çalışır.
- **Maliyet takibi**, yukarıda sıralanan sınırlamalara sahip bir tahmindir.
- **Geliştirme bağımlılıkları:** `npm audit`, `picomatch` ≤ 4.0.7 sürümünde (vitest, vite ve typescript-eslint tarafından kullanılır) bir ReDoS güvenlik uyarısı bildiriyor. Henüz düzeltilmiş bir sürüm yok. Uyarı yalnızca geliştirme araçlarını etkiler; bu araçlar da yalnızca bu deponun kendi yapılandırma dosyalarındaki glob kalıplarını eşleştirir. Üretim paketinin bağımlılıklarında bilinen bir güvenlik açığı yoktur.

## Lisans

[MIT](LICENSE)
