# Olaylar: Krizler, Tamir Kafe ve Rakip Düelloları — Tasarım Önerisi

> Durum: **onaylandı.** Sayılar başlangıç değeridir, hepsi `constants.ts`'e gider ve
> `era-pace` ile ayarlanır.
>
> Verilen kararlar: olay sıklığı **25–35 günde bir** (§1.2); kart **saati durdurur**;
> Tamir Kafe **cumartesi**; düello reddi **−50 itibar**, ilk ölçümde arketip yarışıyla
> doğrulanır (§6).
>
> Bağımlılık: `roller-ve-kanatlar.md` (onaylı, uygulanıyor). Düellolar oradaki yarışma
> puanını (§7.4) ve rakip kanat güçlerini kullanır; bildirimler oradaki bildirim
> sisteminden çıkar. Bu belge o sistemleri **kopyalamaz, üstüne oturur.**

## 0. Neden

Bugün oyunda her şey planlı: sen proje açarsın, fatura ayda bir gelir, ödül gecesi yılda
bir. Hackerspace hayatı ise sürprizlerle dolu: sigorta atar, ev sahibi arar, komşu bozuk
radyosunu getirir, Konya'dakiler "hodri meydan" der. Bu belge üç şey ekliyor:

| | Ne | Tezle bağı |
|---|---|---|
| **Krizler** | Sana gelen, seçimli küçük hikâyeler | Planı bozar; bitirmeyi zorlaştırır, öncelik seçtirir |
| **Tamir Kafe** | Senin düzenlediğin aylık etkinlik | Mahalleyle bağ; ekibin hafta sonu emeği karşılığında topluluk |
| **Rakip düellosu** | Bir rakibin sana açtığı birebir meydan okuma | Tarihi olan, kaybedilebilecek bir söz: **bitir ya da kaybet** |

İlke (§13'ün kuralı): **bedelsiz seçenek yok.** Her seçimin bir karşılığı var; "görmezden
gel" de bir seçimdir ve onun da bedeli vardır.

## 1. Ortak altyapı: olay kartı

Üçü de aynı kalıbı kullanır: **bir kart, iki üç seçenek, belli sonuçlar.**

### 1.1 Kart

- Fatura gibi **modal** bir kart açılır ve **saati durdurur**. Karar vermeden kapanmaz,
  Escape ile de kapanmaz. "Görmezden gel" gerekiyorsa kartta bir seçenek olarak durur.
- Her seçeneğin altında sonucu **önceden yazar**: "₺4.000 · sigorta sorunu biter" ya da
  "ücretsiz · her gün %8 ihtimalle baskı yanar". Sonucunu bilmediğin seçim karar değil,
  zar atmaktır (§6'daki kuralın aynısı).
- Seçimden sonra log'a bir satır düşer. Sonucu ileride belli olacak seçimler ("pazarlık
  et") o zaman ikinci bir satır yazar.
- Sadece haber veren olaylar (düello sonucu, "sigorta yine attı") kart açmaz, **bildirim**
  olarak çıkar (roller-ve-kanatlar §7.2'deki sistem).

### 1.2 Kod

```ts
// src/utils/events.ts: içerik; sayılar constants.ts'de
EventDef {
  id, kind: 'crisis' | 'opportunity' | 'challenge',
  when: (ctx) => number,          // 0 = olamaz; >0 = ağırlık (duruma göre)
  cooldownDays, oncePerRun?,
  choices: ChoiceDef[],           // 2-3 tane
}
ChoiceDef { id, preview: (ctx) => Text, apply: (sim) => void, needs?: (ctx) => string | null }

// store: modal olan tek alan, kaydedilir
event: ActiveEvent | null        // { defId, day, params }
eventHistory: { defId, day, choice }[]   // bekleme süreleri ve sonradan gelen sonuçlar için
```

- **Seçim `Simulation` içinde uygulanır, ama sadece açık API üzerinden** (spend, earn, bir
  üyeyi izne çıkarmak, bir yazıcıyı arızalı saymak…), geliştirici konsolunun kuralıyla
  aynı. Böylece bir olay oyunu, oyunun kendi başına varamayacağı bir duruma sokamaz.
- **Zamanlama:** Her gün başında tek bir zar atılır. Ortalamada **25–35 günde bir olay**
  olur, yani yılda üç dört tane: her biri bir hikâye olacak kadar seyrek. İlk 15 gün olay
  yok. İki olay arasında en az 15 gün var. Fatura, ödül gecesi ve
  yarışma günlerinde olay çıkmaz: aynı güne iki modal düşmesin.
- **Metin i18n'de:** `src/i18n/{en,tr}/events.ts`. Olaylar anlatı, ve anlatının Türkçesi
  İngilizcesi kadar önemli. Katalog gibi "şimdilik İngilizce" bırakılmaz.
- **Rastgelelik simülasyonun kendi RNG'sinden gelir**, harness'ler aynı tohumla aynı
  olayları görür.

### 1.3 Ölçüm

- `NO_EVENTS=1 npm run era-pace`: `NO_SHOP` gibi aynı koşuyu olaysız oynatır. Olaylar
  oyunu belirgin biçimde zorlaştırıyor ya da kolaylaştırıyorsa sayıları ona göre ayarlarız.
- Otomatik oyuncu için basit bir kural lazım: gücü yetiyorsa kalıcı çözümü seçer, yoksa en
  ucuzunu. Ayrıca **hep görmezden gelen** bir oyuncuyla **hep ödeyen** bir oyuncu
  yarıştırılır. İkisinden biri açık ara kazanıyorsa o olayda karar yok demektir
  (hype-check'teki "arketip yarışı" dersi).

## 2. Krizler

Her kriz mevcut bir sisteme bağlanır. Oyuncuya yeni bir sayı öğretmez, bildiği bir şeyi
zora sokar. **Ağırlık duruma göre değişir**: CNC'n yoksa gürültü şikâyeti gelmez.

| Kriz | Ne zaman olabilir | Seçenekler |
|---|---|---|
| **Sigorta attı** | Aynı anda 3+ makine çalışıyor | **Elektrikçi** ₺4.000 → bu kontratta bir daha olmaz · **Sigortayı kaldır** → ücretsiz, ama 20 gün boyunca her gün %8 ihtimalle çalışan baskılardan biri yanar |
| **Ev sahibi aradı** | 2. aydan sonra | **Zammı kabul et** → kira +%15, 3 ay · **Pazarlık et** → 3 saatin gider; ekip moraline göre %50–70 ihtimalle zam yok, olmazsa zam +%20 · **Taşınmakla tehdit et** → sadece bir sonraki kontrat açıksa; zam yok ama taşınma ücreti %20 artar |
| **Komşu şikâyeti** | CNC, masa tenisi ya da arcade varsa | **Akustik panel** → hemen satın alınır · **Sessiz saatler** → 17:00'den sonra gürültülü makine ve oyun yok, moral −3 · **Aldırma** → sonraki şikâyette zabıta: ₺6.000 ceza ve itibar kaybı |
| **Tedarik krizi** | Yolda sipariş varken | **Hepsini hızlandır** → her siparişe ekspres ücreti · **Bekle** → teslim süreleri +4 gün · **Başka tedarikçi** → süre aynı, o projelerin kalitesi −0.05 |
| **Tükenmişlik** | Enerjisi uzun süre düşük kalan bir üye | **5 gün izin ver** → projesinden çıkar, dönünce moral +15 · **Biraz daha dayan** → devam eder; %40 ihtimalle bir hafta içinde ayrılır |
| **Filament yanlış geldi** | Yazıcı varken | **İade et** → 2 gün yazıcılar filamentsiz kalır · **Kullan** → 10 gün boyunca baskı hatası ×1.5 |
| **Hırsızlık** | 2. dönem ve sonrası | **Kilit ve kamera** ₺3.500 → tekrarı yok · **Üyelere güven** → aynısı yeniden olabilir; bu seferki kaybı: bir makinenin filamenti ya da ₺2.000 |

Olumlu olaylar da aynı kartla gelir ve onların da bedeli var:

| Fırsat | Seçenekler |
|---|---|
| **Bağış makine** (bir üniversite eski bir yazıcı veriyor) | **Al** → bedava yazıcı ama yer kaplar, kalibrasyonu kötü · **Teşekkür et** → +itibar |
| **Hacker News'e düştük** (yüksek ilgili bir proje teslim edilince) | **Yazıyı sen yaz** → 3 saatin gider, ilgi ×2 · **Kendi hâline bırak** → ilgi ×1.3 · **Sunucu çöktü dersi**: yazılım projesiyse %30 ihtimalle ilgi yarıya iner |
| **Gazeteci geldi** | **Tur ver** → 2 saat, başvurular hızlanır · **Yarım kalanı göster** → rafta yarım bir proje varsa +ilgi, ama 20 gün içinde bitmezse itibar kaybı ("hâlâ bitmedi mi?") |

"Gazeteci" bilerek tezin kendisi: yarım işi göstermek bir **söz** vermek demek.

## 3. Tamir Kafe

Hackerspace'lerin mahalleyle en gerçek bağı. Tasarımdaki hiç yapılmamış "Etkinlik düzenle"
hamlesinin ilk örneği.

### 3.1 Nasıl çalışır

- **Etkinlik olarak takvime konur:** "Her ayın ilk cumartesisi Tamir Kafe." Bir kez
  açarsın, kapatana kadar sürer.
- **Şart:** en az bir **Donanım İstasyonu**, ve o cumartesi gelmeye gönüllü en az iki üye.
  Cumartesi normalde kimse gelmez; Tamir Kafe'ye gelmek bir **hafta sonu fedakârlığı**.
- **Kim gelir:** Elektronik ya da mekanik rolü olan, o gün enerjisi yeterli olanlar.
  Mentor özelliği olan biri varsa gelmesi daha olası. Kimseyi zorlayamazsın, gönüllü modeli.
- **Gün boyunca:** Mahalleden 4–8 eşya gelir: radyo, tost makinesi, bisiklet ışığı. Her
  eşya bir istasyonda birkaç saatlik iş. Tamir edilen her eşya bir **mahalle iyiliği** puanı
  getirir. Para bağış kutusundan gelir ve az.
- **Sahibi olarak** sen de bir tezgâha geçebilirsin. Saatin gider, ama bir eşya daha
  tamir edilir.

### 3.2 Getirisi ve bedeli

| Getirisi | Bedeli |
|---|---|
| **Mahalle iyiliği:** ilgi gibi yavaşça söner (ayda yarıya iner) ve topluluk üyeliğini besler, yani aidat getirir | Gelenler pazartesi yorgun başlar: enerji −25 |
| Her Tamir Kafe'de %30 ihtimalle bir tamirci **başvurur** (sıradaki başvurana öncelik) | İstasyonlar o gün başka iş için boş kalmaz, ama zaten cumartesi |
| Yılın en çok tamir eden mekânı → Space of the Year değerlendirmesinde küçük bir artı | Bir eşya "tamir edilemedi" çıkarsa küçük bir itibar kaybı ("komşunun radyosu yandı") |

Bu, §13'ün testini geçer: **devam etmeyi (katılımı) etkileyen** bir hamle. Hafta sonu
emeğini topluluğa ve adaylara çevirir. Ölçüm: Tamir Kafe'yi hep açan bir oyuncu ile hiç
açmayanı karşılaştırırız.

### 3.3 Ekranda

- **İnşa → Etkinlikler** rafı (ilk öğe Tamir Kafe; ileride Açık Ev, Lehim Atölyesi).
- O cumartesi odada: kapıda bir kuyruk, tezgâhlarda eşyalar, masada bağış kutusu. Oyunun
  "gözlemlenen diorama" kuralı: etkinlik **görünür** olmalı.
- Günün sonunda bildirim: "Tamir Kafe: 6 eşya tamir edildi, 1 yandı · ₺340 bağış · +12 iyilik".

## 4. Rakip düellosu

Yıllık yarışmalar herkese açık ve takvimi sabit (roller-ve-kanatlar §7). Düello ise
**kişisel**: bir rakip seni **birebir** çağırır, bir iddia koyar, sen kabul edersin ya da
etmezsin.

### 4.1 Nasıl gelir

- **Kim çağırır:** Sıralamada sana yakın (±3 sıra) ve bu kanatta güçlü bir rakip. Son
  düellodaki rakibin tekrar çağırma olasılığı daha yüksek: **rövanş**.
- **Ne zaman:** Yılda 2–3 kez. Bir yarışmaya ya da ödül gecesine 10 günden yakın değil.
- **Kart:** "Konya Hackerspace meydan okuyor: *12 gün içinde en iyi drone'u kim yapar?*
  İddia: ₺5.000 ve 150 itibar."

### 4.2 Seçenekler

| Seçenek | Sonuç |
|---|---|
| **Kabul et** | Kanatta süren bir projeni aday gösterirsin ya da yenisini başlatırsın. Proje tarihten önce biterse puanlanır |
| **Kabul et ve iddiayı büyüt** | İddia iki katına çıkar. Kaybedersen de iki katı gider |
| **Reddet** | Bedeli küçük ama var: −50 itibar, rakip sosyal medyada "kaçtılar" diye yazar |

### 4.3 Puan

- **Senin puanın:** yarışma puanının aynısı (§7.4): `kalite × tasarım çekiciliği × kapsam`.
  Proje zamanında bitmezse puanın sıfır olur, yani kaybedersin. **Tezin en çıplak hâli:
  bitmeyen proje kaybeder.**
- **Rakibin puanı:** kanat gücü × kendi temposu × küçük bir zar. Kartta yazmaz, ama
  rakibin bu kanattaki gücü yazar ("Konya · Mekanik: güçlü"). Tahmin etmek sana kalır.
- **Sonuç:** bir bildirim ve log satırı. Kazanırsan iddia, itibar, ve Ranking'de o
  mekânın sayfasında **birebir karne** ("Konya'ya karşı 2–1"). Bu karne rakipleri
  canlandıran şey, tablodaki bir sayı olmaktan çıkarır.

### 4.4 Neden yarışmadan ayrı

Yarışmalar takvime göre gelir ve herkes girer. Düello ise sana özel ve seçimli: kabul
etmek, tezgâhtaki başka bir işi geri plana atmak demek. Her ikisi de **aynı puan
fonksiyonunu** kullanır, iki ayrı puan sistemi olmaz.

## 5. Uygulama sırası

Her adım kendi başına oynanabilir. Sonunda `era-pace` üç zorlukta, olaylı ve olaysız
(`NO_EVENTS=1`) çalıştırılır; `click-check`'e her kart tipi için bir test eklenir.

1. **Olay altyapısı ve krizler.** `events.ts`, kart, kayıt dönüşümü, zamanlama; önce
   sigorta, ev sahibi, tükenmişlik ve tedarik krizi (en çok sisteme dokunan dört kriz).
   Yarışmalardan bağımsız, **hemen başlanabilir.**
2. **Kalan krizler ve fırsatlar.** Gazeteci, Hacker News, bağış, hırsızlık, filament.
3. **Tamir Kafe.** Etkinlik rafı, cumartesi gönüllülüğü, mahalle iyiliği → üyelik.
4. **Rakip düellosu.** Roller-ve-kanatlar faz 5'ten (yarışma puanı, kanat güçleri)
   **sonra**; o hazır olunca düello onun üstüne birkaç günlük iş.

## 6. Kararlar (kapandı)

1. **Olay sıklığı:** 25–35 günde bir. Zorluk sadece sıklığı değiştirir, bedelleri değil
   (§3c'nin kuralı: kurallar her zorlukta aynı).
2. **Kart saati durdurur**, fatura gibi. Karar isteyen bir şey, sen okurken arkada baskı
   yakmamalı.
3. **Tamir Kafe cumartesi.** "Hafta sonu kimse gelmez" kuralını bilerek esnetir:
   fedakârlık olmasının sebebi bu.
4. **Düello reddi −50 itibar.** Az olursa hep reddedilir, çok olursa zorunlu olur; ilk
   ölçümde hep reddeden ile hep kabul eden oyuncuları yarıştırıp doğrularız.
